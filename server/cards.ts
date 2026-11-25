import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildCardCatalog, cardModeSchema, challengeCardSchema, type ChallengeCard } from './card-catalog.js';
import { ExecutionService } from './runner/jobs.js';
import { judgeCases } from './runner/judge.js';

export const cardTables = ['challenge_cards', 'card_progress', 'card_attempts', 'card_completions'];
export const runnerTables=['runner_executions'];
type Row = Record<string, any>;
const error = (message:string,status=400)=>Object.assign(new Error(message),{status});
const now = ()=>new Date().toISOString();
const json = JSON.stringify;
const normalizeOutput = (s:string)=>s.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').replace(/\n+$/,'');
const answerText=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleUpperCase('vi');

export function validateCardRows(data: Record<string, Row[]>) {
  const defs=new Map(data.challenge_cards.map(row=>{
    const def=challengeCardSchema.parse(JSON.parse(row.definition));
    if(row.id!==def.id||row.lesson_id!==def.lessonId||row.ordinal!==def.ordinal)throw error('Định nghĩa thẻ không khớp metadata.');
    return [row.id,def];
  }));
  const refs=new Set(data.source_references.map(r=>r.id));
  for(const card of defs.values())for(const ref of card.sourceReferences)if(!refs.has(ref))throw error('Bản sao lưu thiếu nguồn thẻ.');
  for(const row of data.card_attempts){
    const results=z.array(z.object({input:z.string(),expected:z.string(),actual:z.string(),matched:z.boolean()})).parse(JSON.parse(row.results));
    const card=defs.get(row.card_id);
    if(!card)throw error('Bài làm thiếu thẻ.');
    const codeVerified=card.kind==='code'&&row.verified;
    const expectedCases=codeVerified?judgeCases(card):card.samples;
    if(!expectedCases)throw error('Bản sao lưu có bài chấm chưa được kiểm duyệt.');
    if(!codeVerified&&results.length!==expectedCases.length)throw error('Kết quả thẻ thiếu ví dụ.');
    if(codeVerified&&(results.length>expectedCases.length||row.status==='accepted'&&results.length!==expectedCases.length))throw error('Kết quả chấm code thiếu/thừa test.');
    for(const [i,r] of results.entries()){
      const sample=expectedCases[i];
      const expectedMatch=codeVerified||!row.verified?normalizeOutput(r.actual)===normalizeOutput(sample.expected):card.answer!==undefined&&answerText(r.actual)===answerText(card.answer);
      if(r.input!==sample.input||r.expected!==sample.expected||r.matched&&!expectedMatch||!codeVerified&&r.matched!==expectedMatch)throw error('Kết quả đối chiếu thẻ không nhất quán.');
    }
    if(codeVerified){
      if(!['accepted','wrong_answer','compile_error','runtime_error','timeout'].includes(row.status))throw error('Trạng thái chạy code không hợp lệ.');
      if(row.status==='accepted'&&!results.every(r=>r.matched))throw error('Bài code được chấp nhận có test sai.');
      if(row.status==='wrong_answer'&&results.every(r=>r.matched))throw error('Bài code sai nhưng không có test sai.');
    }else if(row.verified&&row.status!==(results.every(r=>r.matched)?'correct':'incorrect'))throw error('Trạng thái chấm đáp án thẻ không khớp.');
    if(!row.verified&&!['manual_match','manual_mismatch'].includes(row.status))throw error('Loại kết quả thẻ không hợp lệ.');
    if((row.status==='manual_match')!==results.every(r=>r.matched)&&!row.verified)throw error('Kết quả đối chiếu không hợp lệ.');
  }
  for(const row of data.card_completions){
    const attempt=data.card_attempts.find(a=>a.id===row.attempt_id),card=defs.get(row.card_id);
    if(!attempt||!card||attempt.user_id!==row.user_id||attempt.card_id!==row.card_id||!attempt.verified||!['correct','accepted'].includes(attempt.status)||row.xp!==card.xp)throw error('Hoàn thành thẻ không có kết quả được xác minh.');
  }
}

export function installCards(db:DatabaseSync) {
  const executions=new ExecutionService(db);
  const all=(sql:string,...args:any[]):Row[]=>db.prepare(sql).all(...args) as Row[];
  const one=(sql:string,...args:any[]):Row|undefined=>db.prepare(sql).get(...args) as Row|undefined;
  const run=(sql:string,...args:any[])=>db.prepare(sql).run(...args);
  const transaction=<T>(work:()=>T)=>{db.exec('BEGIN IMMEDIATE');try{const r=work();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  const seed=()=>transaction(()=>{
    for(const card of buildCardCatalog(all('SELECT id,summary,content,source_references FROM lessons') as any)){
      // Never overwrite cards/attempts when upgrading or restoring.
      run('INSERT OR IGNORE INTO challenge_cards VALUES (?,?,?,?)',card.id,card.lessonId,card.ordinal,json(card));
    }
  });
  seed();
  const getCard=(id:string)=>{const row=one('SELECT definition FROM challenge_cards WHERE id=?',id);if(!row)throw error('Không tìm thấy thẻ.',404);return challengeCardSchema.parse(JSON.parse(row.definition));};
  const progress=(cardId:string,mode:string)=>{
    const p=one('SELECT * FROM card_progress WHERE user_id=? AND card_id=? AND mode=?','local',cardId,mode);
    const completed=one('SELECT * FROM card_completions WHERE user_id=? AND card_id=?','local',cardId);
    const attempts=all('SELECT id,mode,status,verified,results,created_at FROM card_attempts WHERE user_id=? AND card_id=? AND mode=? ORDER BY rowid DESC LIMIT 50','local',cardId,mode);
    return {code:p?.code??null,hintsUsed:p?.hints_used||0,solutionViewed:!!p?.solution_viewed,activeSeconds:p?.active_seconds||0,
      attempts:Number(one('SELECT count(*) AS n FROM card_attempts WHERE user_id=? AND card_id=? AND mode=?','local',cardId,mode)?.n||0),
      completed:!!completed,xp:completed?.xp||0,history:attempts.map(a=>({...a,verified:!!a.verified,results:JSON.parse(a.results)}))};
  };
  const ensure=(id:string,mode:string)=>run('INSERT OR IGNORE INTO card_progress VALUES (?,?,?,?,?,?,?,?)','local',id,mode,'',0,0,0,now());
  const publicCard=(c:ChallengeCard,mode:string)=>({id:c.id,lessonId:c.lessonId,deck:c.deck,ordinal:c.ordinal,kind:c.kind,title:c.title,goal:c.goal,difficulty:c.difficulty,xp:c.xp,
    prompt:c.prompt,samples:c.samples,starterCode:mode==='training'?c.starterCode:'',sourceReferences:c.sourceReferences,supplemental:c.supplemental,
    theory:c.theory,formula:c.formula,examEligible:c.examEligible,progress:progress(c.id,mode)});
  const router=Router();
  router.get('/cards',(req,res)=>{
    const mode=cardModeSchema.parse(req.query.mode||'training'),lessonId=z.string().max(180).optional().parse(req.query.lessonId);
    const deck=lessonId?.startsWith('caesar')?'caesar':lessonId;
    let cards=all('SELECT definition FROM challenge_cards ORDER BY lesson_id,ordinal').map(r=>getCard(JSON.parse(r.definition).id));
    if(deck)cards=cards.filter(c=>c.deck===deck||c.lessonId===lessonId);
    if(mode==='exam')cards=cards.filter(c=>c.examEligible);
    res.json({cards:cards.map(c=>({...publicCard(c,mode),canSubmit:!!judgeCases(c)})),runner:executions.runner.availability,mode});
  });
  router.get('/cards/:id',(req,res)=>{const mode=cardModeSchema.parse(req.query.mode||'training');const c=getCard(req.params.id);if(mode==='exam'&&!c.examEligible)throw error('Thẻ này không phải bài tổng hợp cho chế độ kiểm tra.');res.json({card:publicCard(c,mode)});});
  const saveSchema=z.object({mode:cardModeSchema,code:z.string().max(100000)}).strict();
  router.put('/cards/:id/progress',(req,res)=>{
    const b=saveSchema.parse(req.body);getCard(req.params.id);ensure(req.params.id,b.mode);
    run('UPDATE card_progress SET code=?,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',b.code,now(),'local',req.params.id,b.mode);
    res.json({saved:true});
  });
  // Tokens bound to one card/mode prevent accidental duplicate timing batches.
  const timers=new Map<string,{cardId:string;mode:string;last:number}>();
  router.post('/cards/:id/session',(req,res)=>{
    const b=z.object({mode:cardModeSchema}).strict().parse(req.body);getCard(req.params.id);
    if(timers.size>=500)for(const [token,t] of timers)if(Date.now()-t.last>300000)timers.delete(token);
    if(timers.size>=500)throw error('Quá nhiều phiên luyện tập. Hãy tải lại sau.',429);
    const token=randomUUID();timers.set(token,{cardId:req.params.id,mode:b.mode,last:Date.now()});res.json({token});
  });
  router.post('/cards/:id/time',(req,res)=>{
    const b=z.object({mode:cardModeSchema,token:z.string(),seconds:z.number().int().min(1).max(60)}).strict().parse(req.body);
    const t=timers.get(b.token);if(!t||t.cardId!==req.params.id||t.mode!==b.mode)throw error('Phiên luyện tập hết hạn. Mở lại thẻ để tiếp tục.',409);
    if(Date.now()-t.last<b.seconds*1000-500)throw error('Khoảng thời gian chưa đủ.',429);
    t.last=Date.now();ensure(req.params.id,b.mode);
    run('UPDATE card_progress SET active_seconds=active_seconds+?,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',b.seconds,now(),'local',req.params.id,b.mode);
    res.json({saved:true});
  });
  router.post('/cards/:id/hint',(req,res)=>{
    const b=z.object({mode:cardModeSchema}).strict().parse(req.body);const c=getCard(req.params.id);
    if(b.mode!=='training')throw error('Gợi ý chỉ mở trong chế độ luyện tập.',403);
    ensure(c.id,b.mode);const level=Math.min(3,Number(one('SELECT hints_used FROM card_progress WHERE user_id=? AND card_id=? AND mode=?','local',c.id,b.mode)?.hints_used)+1);
    run('UPDATE card_progress SET hints_used=?,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',level,now(),'local',c.id,b.mode);
    res.json({level,hints:c.hints.slice(0,level)});
  });
  router.get('/cards/:id/hints',(req,res)=>{const c=getCard(req.params.id);const mode=cardModeSchema.parse(req.query.mode||'training');if(mode!=='training')throw error('Chế độ này không mở gợi ý.',403);const p=progress(c.id,mode);res.json({hints:c.hints.slice(0,p.hintsUsed)});});
  router.post('/cards/:id/solution',(req,res)=>{
    const b=z.object({mode:cardModeSchema,confirmed:z.literal(true)}).strict().parse(req.body);const c=getCard(req.params.id);
    if(b.mode!=='training')throw error('Lời giải chỉ mở khi chủ động yêu cầu trong chế độ luyện tập.',403);
    ensure(c.id,b.mode);run('UPDATE card_progress SET solution_viewed=1,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',now(),'local',c.id,b.mode);res.json({solution:c.solution});
  });
  router.get('/runner/status',(_req,res)=>res.json(executions.runner.availability));
  router.get('/runner/jobs/:id',(req,res)=>res.json(executions.get(req.params.id)));
  router.post('/runner/jobs/:id/stop',(req,res)=>res.json(executions.cancel(req.params.id)));
  router.post('/cards/:id/execute',(req,res)=>{
    const b=z.object({code:z.string().min(1).max(100000),stdin:z.string().max(20000).default(''),mode:cardModeSchema,action:z.enum(['run','submit'])}).strict().parse(req.body);
    const card=getCard(req.params.id);if(card.kind!=='code')throw error('Thẻ này không phải C++.');if(b.mode==='exam'&&!card.examEligible)throw error('Thẻ không thuộc chế độ kiểm tra.');
    ensure(card.id,b.mode);run('UPDATE card_progress SET code=?,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',b.code,now(),'local',card.id,b.mode);
    const job=executions.start(card,b.code,b.stdin,b.mode,b.action,outcome=>{
      let xp=0;
      if(b.action==='submit'&&outcome.status!=='runner_error')transaction(()=>{
        const attemptId=randomUUID(),status=['accepted','wrong_answer','compile_error','timeout'].includes(outcome.status)?outcome.status:'runtime_error';
        run('INSERT INTO card_attempts VALUES (?,?,?,?,?,?,?,?,?)',attemptId,'local',card.id,b.mode,b.code,status,1,json(outcome.results),now());
        if(status==='accepted'&&!one('SELECT card_id FROM card_completions WHERE user_id=? AND card_id=?','local',card.id)){
          run('INSERT INTO card_completions VALUES (?,?,?,?,?)','local',card.id,attemptId,card.xp,now());xp=card.xp;
        }
      });
      return {xp,progress:progress(card.id,b.mode)};
    });res.status(202).json(job);
  });
  router.post('/cards/:id/attempts',(req,res)=>{
    const b=z.object({mode:cardModeSchema,code:z.string().max(100000),kind:z.enum(['external','answer']),outputs:z.array(z.string().max(20000)).max(20).optional(),answer:z.string().max(10000).optional()}).strict().parse(req.body);
    const c=getCard(req.params.id);if(b.mode==='exam'&&!c.examEligible)throw error('Thẻ không thuộc chế độ kiểm tra.');
    if(c.kind==='code'&&b.kind!=='external')throw error('Chấm C++ tự động chưa khả dụng.',503);
    if(c.kind!=='code'&&(b.kind!=='answer'||c.answer===undefined||b.answer===undefined))throw error('Thẻ chưa có bộ chấm đáp án đáng tin cậy.');
    const verified=c.kind!=='code';
    if(!verified&&(!b.outputs||b.outputs.length!==c.samples.length))throw error('Cần nhập output cho từng ví dụ.');
    const results=c.samples.map((s,i)=>({input:s.input,expected:s.expected,actual:verified?b.answer!:b.outputs![i],matched:verified?answerText(b.answer!)===answerText(c.answer!):normalizeOutput(b.outputs![i])===normalizeOutput(s.expected)}));
    const matched=results.every(r=>r.matched),status=verified?(matched?'correct':'incorrect'):(matched?'manual_match':'manual_mismatch');
    let xp=0;const attemptId=randomUUID();
    transaction(()=>{
      ensure(c.id,b.mode);run('UPDATE card_progress SET code=?,updated_at=? WHERE user_id=? AND card_id=? AND mode=?',b.code,now(),'local',c.id,b.mode);
      run('INSERT INTO card_attempts VALUES (?,?,?,?,?,?,?,?,?)',attemptId,'local',c.id,b.mode,b.code,status,verified?1:0,json(results),now());
      if(verified&&matched&&!one('SELECT card_id FROM card_completions WHERE user_id=? AND card_id=?','local',c.id)){
        run('INSERT INTO card_completions VALUES (?,?,?,?,?)','local',c.id,attemptId,c.xp,now());xp=c.xp;
      }
    });
    res.json({status,verified,xp,results,progress:progress(c.id,b.mode),feedback:verified?(matched?'Chính xác.':'Chưa đúng. Thử lại hoặc mở gợi ý khi cần.'):(matched?'Output tự nhập khớp ví dụ. Mã nguồn chưa được chạy và xác minh; không hoàn thành thẻ, không nhận XP.':'Output tự nhập chưa khớp ví dụ. So sánh từng ký tự, dấu cách và xuống dòng. Không thể kết luận về lỗi biên dịch/runtime từ output tự nhập.')});
  });
  router.post('/cards',(req,res)=>{
    const b=challengeCardSchema.omit({id:true}).extend({confirmed:z.literal(true)}).strict().parse(req.body);
    if(!one('SELECT id FROM lessons WHERE id=?',b.lessonId))throw error('Bài học không tồn tại.');
    if(b.kind!=='code'&&b.answer===undefined)throw error('Thẻ này cần đáp án để chấm.');
    for(const ref of b.sourceReferences)if(!one('SELECT id FROM source_references WHERE id=?',ref))throw error('Nguồn không tồn tại.');
    const card=challengeCardSchema.parse({...b,id:randomUUID()});run('INSERT INTO challenge_cards VALUES (?,?,?,?)',card.id,card.lessonId,card.ordinal,json(card));res.status(201).json({card:publicCard(card,'training')});
  });
  return {router,seed,executions,close:()=>executions.close()};
}
