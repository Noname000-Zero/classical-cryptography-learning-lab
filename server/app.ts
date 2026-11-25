import express, { type Request, type Response, type NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { cardTables, runnerTables, installCards, validateCardRows } from './cards.js';
import { tutorRouter } from './tutor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyTables = ['users','courses','modules','lessons','concepts','documents','source_references','examples','exercises','test_cases','submissions','assessments','assessment_attempts','progress','review_schedule','achievements','user_achievements','learning_sessions','document_import_jobs','settings'];
const tables = [...legacyTables,...cardTables,...runnerTables];
const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const now = () => new Date().toISOString();
const localDate = (value: string | number = Date.now()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const sourceReferenceSchema=z.object({id:z.string().min(1),slide:z.number().int().positive().nullable(),location:z.string(),text:z.string()}).passthrough();
const exerciseSchema=z.object({id:z.string().min(1).max(150),type:z.enum(['text','mcq','calculation','ordering','matching','flashcard']).default('text'),prompt:z.string().min(1).max(20000),answer:z.union([z.string().max(10000),z.array(z.string().max(10000)).min(1)]),explanation:z.string().max(20000).default(''),supplemental:z.boolean().default(true),options:z.array(z.string().max(2000)).max(50).optional()});
const lessonSchema=z.object({id:z.string().min(1).max(150),courseId:z.string().min(1),moduleId:z.string().min(1),title:z.string().min(1).max(300),summary:z.string().max(20000).default(''),content:z.record(z.string(),z.unknown()),sourceReferences:z.array(z.string()).max(2000).default([]),exercises:z.array(exerciseSchema).max(200).default([])});
const id = () => randomUUID();
const encode = (a: unknown) => JSON.stringify(a);
const decode = (s: unknown, fallback: unknown = []) => { try { return JSON.parse(String(s)); } catch { return fallback; } };
const message = (m: string, status = 400) => Object.assign(new Error(m), { status });
const normalized = (a: string) => a.trim().replace(/\s+/g,' ').toUpperCase();
const invalidFilename=(name:string)=>/[\\/]/.test(name)||Array.from(name).some(c=>c.charCodeAt(0)<32);
type Row = Record<string, any>;

export function createApp(options: {dataDir?: string; catalogPath?: string; sourceRoot?: string} = {}) {
  const dataDir = options.dataDir || process.env.ACADEMY_DATA_DIR || path.join(root,'data','runtime');
  const storage = path.join(dataDir,'files');
  fs.mkdirSync(storage,{recursive:true});
  fs.mkdirSync(path.join(dataDir,'backups'),{recursive:true});
  const existingDatabase=fs.existsSync(path.join(dataDir,'academy.sqlite'));
  const db = new DatabaseSync(path.join(dataDir,'academy.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(fs.readFileSync(path.join(root,'migrations','001_initial.sql'),'utf8'));
  if(existingDatabase&&!db.prepare('SELECT version FROM migration WHERE version=2').get()){
    // SQLite takes a consistent snapshot including WAL; never copy a live .sqlite file.
    db.prepare('VACUUM INTO ?').run(path.join(dataDir,'backups',`before-code-first-${Date.now()}-${randomUUID()}.sqlite`));
  }
  db.exec(fs.readFileSync(path.join(root,'migrations','002_challenge_cards.sql'),'utf8'));
  if(existingDatabase&&!db.prepare('SELECT version FROM migration WHERE version=3').get())db.prepare('VACUUM INTO ?').run(path.join(dataDir,'backups',`before-runner-${Date.now()}-${randomUUID()}.sqlite`));
  db.exec(fs.readFileSync(path.join(root,'migrations','003_runner.sql'),'utf8'));
  const all = (sql: string, ...args: any[]): Row[] => db.prepare(sql).all(...args) as Row[];
  const one = (sql: string, ...args: any[]): Row | undefined => db.prepare(sql).get(...args) as Row | undefined;
  const run = (sql: string,...args:any[]) => db.prepare(sql).run(...args);
  const transaction = <T>(f:()=>T) => { db.exec('BEGIN IMMEDIATE'); try { const result=f(); db.exec('COMMIT'); return result; } catch(e) {db.exec('ROLLBACK'); throw e;} };
  run('INSERT OR IGNORE INTO users VALUES (?,?)','local','Học viên');
  run('INSERT OR IGNORE INTO settings VALUES (?,?)','local',encode({theme:'dark',animations:true,sound:false}));
  for (const a of [ ['first-goal','Bàn thắng đầu tiên','Giải đúng bài tập đầu tiên.'], ['hat-trick','Hat-trick','Trả lời đúng ba lượt liên tiếp.'], ['comeback','Lội ngược dòng','Giải đúng một bài từng trả lời sai.'], ['tactical-genius','Bậc thầy chiến thuật','Trả lời đúng tất cả bài tập của một bài học.'] ]) run('INSERT OR IGNORE INTO achievements VALUES (?,?,?)',...a);
  // Keep the private local curriculum when present; clean public clones use original demo content.
  const catalogPath=options.catalogPath || (fs.existsSync(path.join(root,'data','catalog.json'))?path.join(root,'data','catalog.json'):path.join(root,'data','demo-catalog.json'));
  if (fs.existsSync(catalogPath) && !one('SELECT version FROM migration WHERE version=100')) {
    const catalog=z.object({documents:z.array(z.object({id:z.string(),name:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().nonnegative(),relativePath:z.string(),chapter:z.union([z.string(),z.number()]).optional(),priority:z.boolean().optional(),references:z.array(sourceReferenceSchema),limitations:z.array(z.string()).default([])})),lessons:z.array(lessonSchema)}).parse(JSON.parse(fs.readFileSync(catalogPath,'utf8')));
    run('INSERT OR IGNORE INTO courses VALUES (?,?,?)','security','An toàn & bảo mật thông tin','Tài liệu học phần, từ nền tảng đến mật mã và bảo mật hệ thống.');
    for (const d of catalog.documents || []) {
      if(one('SELECT id FROM documents WHERE sha256=?',d.sha256)) continue;
      const sourceRoot=options.sourceRoot || path.resolve(root,'..');
      const source=path.resolve(sourceRoot,d.relativePath || d.name);
      if (!source.startsWith(sourceRoot+path.sep) || !fs.existsSync(source)) continue;
      const buffer=fs.readFileSync(source);
      if(hash(buffer)!==d.sha256) throw message(`Tài liệu ${d.name} thay đổi sau khảo sát.`,500);
      const storageName=id()+path.extname(d.name).toLowerCase();
      fs.writeFileSync(path.join(storage,storageName),buffer,{flag:'wx'});
      transaction(()=>{
        run('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?)',d.id,d.name,'security','Tài liệu gốc từ thư mục môn học.',d.sha256,buffer.length,storageName,'review',encode(d.limitations || ['Hình và công thức nhúng cần đối chiếu trực quan.']),String(d.chapter||''),now());
        for (const [i,r] of (d.references||[]).entries()) run('INSERT INTO source_references VALUES (?,?,?,?,?)',r.id || `${d.id}-ref-${i}`,d.id,r.slide ?? null,r.location || (r.slide?`Slide ${r.slide}`:`Bản ghi ${i+1}`),r.text || '');
        run('INSERT INTO document_import_jobs VALUES (?,?,?,?,?,?)',id(),d.id,d.name,'review','Đã trích xuất văn bản; chờ kiểm tra hình và nội dung.',now());
      });
    }
    for(const l of catalog.lessons||[]) {
      const course=l.courseId || 'security',module=l.moduleId || 'classical';
      if (!one('SELECT id FROM courses WHERE id=?',course)) run('INSERT INTO courses VALUES (?,?,?)',course,course,'');
      run('INSERT OR IGNORE INTO modules VALUES (?,?,?)',module,course,module==='classical'?'Mật mã cổ điển':module);
      run('INSERT OR IGNORE INTO lessons VALUES (?,?,?,?,?,?,?)',l.id,course,module,l.title,l.summary || '',encode(l.content||{}),encode(l.sourceReferences||[]));
      for(const e of l.exercises||[]) run('INSERT OR IGNORE INTO exercises VALUES (?,?,?,?,?,?,?,?)',e.id,l.id,e.type||'text',e.prompt,typeof e.answer==='string'?e.answer:encode(e.answer),e.explanation || '',e.supplemental===false?0:1,encode(e.options||[]));
    }
    run('INSERT OR IGNORE INTO migration VALUES (?,?)',100,now());
  }

  const cards=installCards(db);

  const documentView=(d:Row)=>({id:d.id,name:d.name,courseId:d.course_id,description:d.description,sha256:d.sha256,size:d.size,status:d.status,extractionStatus:d.status,limitations:decode(d.limitations),chapter:d.chapter,createdAt:d.created_at,referenceCount:one('SELECT count(*) AS n FROM source_references WHERE document_id=?',d.id)?.n || 0,slideCount:one('SELECT max(slide) AS n FROM source_references WHERE document_id=?',d.id)?.n || null});
  const lessonView=(l:Row)=>{const content=decode(l.content,{}) as Row;return {id:l.id,courseId:l.course_id,moduleId:l.module_id,title:l.title,summary:l.summary,description:l.summary,content,sourceReferences:decode(l.source_references),stages:content.stages||[],starterCode:content.starterCode,solutionCode:content.solutionCode,input:content.input,output:content.output};};
  const referenceView=(r:Row)=>({id:r.id,documentId:r.document_id,fileName:r.name,slide:r.slide,location:r.location,text:r.text,snippet:r.text});
  const references=(documentId?:string)=>all(`SELECT r.*,d.name FROM source_references r JOIN documents d ON d.id=r.document_id ${documentId?'WHERE d.id=?':''} ORDER BY d.name,r.slide,r.rowid`,...(documentId?[documentId]:[])).map(referenceView);
  const lessonReferences=(l:Row)=>{const ids=decode(l.source_references) as string[];return references().filter(r=>ids.includes(r.id));};
  const progress=()=>all('SELECT id FROM lessons').map(l=>{
    const total=Number(one('SELECT count(*) AS n FROM exercises WHERE lesson_id=?',l.id)?.n || 0);
    const correct=Number(one('SELECT count(DISTINCT e.id) AS n FROM exercises e JOIN submissions s ON s.exercise_id=e.id AND s.correct=1 WHERE e.lesson_id=?',l.id)?.n || 0);
    const attempts=Number(one('SELECT count(*) AS n FROM submissions s JOIN exercises e ON e.id=s.exercise_id WHERE e.lesson_id=?',l.id)?.n || 0);
    const completed=total>0&&correct===total;
    return {lessonId:l.id,total,correct,attempts,mastery:total?Math.round(correct/total*100):0,completed,evidenceLevel:correct===0?'Rookie':!completed?'Academy Player':total<5?'Academy Player':'First Team',masteryNote:'Tỷ lệ câu đã trả lời đúng; chưa xác nhận kỹ năng tự giải thích hoặc lập trình.'};
  });
  const submissions=()=>all('SELECT s.*,e.lesson_id FROM submissions s JOIN exercises e ON e.id=s.exercise_id ORDER BY s.created_at DESC LIMIT 1000').map(s=>({id:s.id,exerciseId:s.exercise_id,lessonId:s.lesson_id,answer:s.answer,correct:!!s.correct,feedback:s.feedback,createdAt:s.created_at,mode:s.mode}));
  const reviews=()=>all('SELECT * FROM review_schedule ORDER BY due_at').map(r=>({id:r.id,lessonId:r.lesson_id,dueAt:r.due_at,intervalDays:r.interval_days,history:decode(r.history)}));
  const stats=()=>{
    const wins=Number(one('SELECT count(DISTINCT exercise_id) AS n FROM submissions WHERE correct=1')?.n || 0);
    const reviewWins=all('SELECT history FROM review_schedule').reduce((n,r)=>n+(decode(r.history) as Row[]).filter(h=>h.correct).length,0);
    const xp=wins*25+reviewWins*10+Number(one('SELECT coalesce(sum(xp),0) AS n FROM card_completions')?.n||0);
    const dates=new Set(all("SELECT date(created_at,'+7 hours') AS d FROM submissions UNION SELECT date(created_at,'+7 hours') AS d FROM learning_sessions UNION SELECT date(created_at,'+7 hours') AS d FROM card_attempts").map(r=>r.d));
    let day=Date.now(),streak=0;
    if(!dates.has(localDate(day)))day-=86400000;
    while(dates.has(localDate(day))){streak++;day-=86400000;}
    return {xp,level:Math.floor(xp/250)+1,streak,completedLessons:progress().filter(p=>p.completed).length,completedCards:Number(one('SELECT count(*) AS n FROM card_completions')?.n||0),cardAttempts:Number(one('SELECT count(*) AS n FROM card_attempts')?.n||0),correctAnswers:wins,attempts:one('SELECT count(*) AS n FROM submissions')?.n || 0,studyMinutes:Math.floor((Number(one('SELECT coalesce(sum(seconds),0) AS n FROM learning_sessions')?.n || 0)+Number(one('SELECT coalesce(sum(active_seconds),0) AS n FROM card_progress')?.n||0))/60),activity:all("SELECT date(created_at,'+7 hours') AS date,count(*) AS attempts,sum(correct) AS correct FROM submissions GROUP BY date(created_at,'+7 hours') ORDER BY date DESC LIMIT 90"),timezone:'Asia/Ho_Chi_Minh'};
  };
  const award=(achievement:string)=>run('INSERT OR IGNORE INTO user_achievements VALUES (?,?,?)','local',achievement,now());
  const grade=(exercise:Row,answer:string)=>{
    const expected=decode(exercise.answer,null);
    const correct=Array.isArray(expected)?expected.some(a=>normalized(String(a))===normalized(answer)):normalized(exercise.answer)===normalized(answer);
    return {correct,feedback:(correct?'Chính xác. ':'Chưa đúng. ')+exercise.explanation,answer:exercise.answer};
  };
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return next(message('Chỉ chấp nhận truy cập local.',403));
    const origin=req.headers.origin;
    if(origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next(message('Nguồn yêu cầu không được phép.',403));
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['sec-fetch-site']==='cross-site') return next(message('Yêu cầu liên trang bị từ chối.',403));
    next();
  });
  app.use('/api/documents',express.raw({type:'application/octet-stream',limit:'20mb'}));
  app.use(express.json({limit:'160mb'}));
  app.use('/api',cards.router);
  app.use('/api',tutorRouter(db));
  app.get('/api/health',(_req,res)=>res.json({ok:true,schemaVersion:3}));
  app.get('/api/bootstrap',(_req,res)=>res.json({courses:all('SELECT id,title,description FROM courses'),modules:all('SELECT id,course_id AS courseId,title FROM modules'),lessons:all('SELECT * FROM lessons').map(lessonView),documents:all('SELECT * FROM documents ORDER BY name').map(documentView),progress:progress(),submissions:submissions(),reviews:reviews(),achievements:all('SELECT a.*,ua.earned_at AS earnedAt FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id'),stats:stats(),settings:decode(one('SELECT value FROM settings WHERE user_id=?','local')?.value,{}),capabilities:{cppRunner:cards.executions.runner.availability.available,aiTutor:false,automatedLessonGeneration:false},jobs:all('SELECT * FROM document_import_jobs ORDER BY created_at DESC LIMIT 100')}));
  app.get('/api/lessons/:id',(req,res)=>{
    const l=one('SELECT * FROM lessons WHERE id=?',req.params.id);if(!l)throw message('Không tìm thấy bài học.',404);
    res.json({lesson:lessonView(l),exercises:all('SELECT id,lesson_id AS lessonId,type,prompt,supplemental,options FROM exercises WHERE lesson_id=?',l.id).map(e=>({...e,supplemental:!!e.supplemental,options:decode(e.options)})),references:lessonReferences(l)});
  });
  app.post('/api/submissions',(req,res)=>{
    const b=z.object({exerciseId:z.string().min(1),answer:z.string().max(10000),mode:z.enum(['practice','match','penalty','champions','review']).optional()}).parse(req.body);
    const exercise=one('SELECT * FROM exercises WHERE id=?',b.exerciseId);if(!exercise)throw message('Không tìm thấy bài tập.',404);
    const result=grade(exercise,b.answer);
    const earned=!!one('SELECT id FROM submissions WHERE exercise_id=? AND correct=1',exercise.id);
    transaction(()=>{
      run('INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?)',id(),'local',exercise.id,b.answer,result.correct?1:0,result.feedback,now(),b.mode||'practice');
      if(result.correct){
        award('first-goal');
        const lastThree=all('SELECT correct,exercise_id FROM submissions ORDER BY rowid DESC LIMIT 3');
        if(lastThree.length===3&&lastThree.every(r=>r.correct)&&new Set(lastThree.map(r=>r.exercise_id)).size===3)award('hat-trick');
        if(one('SELECT id FROM submissions WHERE exercise_id=? AND correct=0',exercise.id))award('comeback');
        if(progress().find(p=>p.lessonId===exercise.lesson_id)?.completed){
          if((progress().find(p=>p.lessonId===exercise.lesson_id)?.total || 0)>=5)award('tactical-genius');
          run('INSERT OR IGNORE INTO review_schedule VALUES (?,?,?,?,?,?)',id(),'local',exercise.lesson_id,new Date(Date.now()+86400000).toISOString(),1,'[]');
        }
      }
    });
    res.json({...result,xp:result.correct&&!earned?25:0,progress:progress(),stats:stats()});
  });
  app.get('/api/code/:lessonId',(req,res)=>res.json({code:one('SELECT code FROM progress WHERE user_id=? AND lesson_id=?','local',req.params.lessonId)?.code ?? null,runnerAvailable:false}));
  app.put('/api/code/:lessonId',(req,res)=>{
    const b=z.object({code:z.string().max(100000)}).parse(req.body);
    if(!one('SELECT id FROM lessons WHERE id=?',req.params.lessonId))throw message('Bài học không tồn tại.',404);
    run('INSERT INTO progress(user_id,lesson_id,code) VALUES (?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET code=excluded.code','local',req.params.lessonId,b.code);res.json({saved:true});
  });
  app.post('/api/courses',(req,res)=>{
    const b=z.object({title:z.string().trim().min(1).max(150),description:z.string().max(2000).default('')}).parse(req.body);const courseId=id();
    run('INSERT INTO courses VALUES (?,?,?)',courseId,b.title,b.description);res.status(201).json({id:courseId,...b});
  });
  app.post('/api/modules',(req,res)=>{
    const b=z.object({courseId:z.string(),title:z.string().trim().min(1).max(150)}).parse(req.body);
    if(!one('SELECT id FROM courses WHERE id=?',b.courseId))throw message('Môn học không tồn tại.');
    const moduleId=id();run('INSERT INTO modules VALUES (?,?,?)',moduleId,b.courseId,b.title);res.status(201).json({id:moduleId,...b});
  });
  app.post('/api/lessons',(req,res)=>{
    const b=lessonSchema.omit({id:true}).extend({confirmed:z.literal(true)}).parse(req.body);
    const module=one('SELECT * FROM modules WHERE id=? AND course_id=?',b.moduleId,b.courseId);
    if(!module)throw message('Chương không thuộc môn học đã chọn.');
    for(const reference of b.sourceReferences)if(!one('SELECT id FROM source_references WHERE id=?',reference))throw message('Nguồn trích dẫn không tồn tại.');
    if(new Set(b.exercises.map(e=>e.id)).size!==b.exercises.length)throw message('ID bài tập trùng nhau.');
    if(b.exercises.some(e=>one('SELECT id FROM exercises WHERE id=?',e.id)))throw message('ID bài tập đã tồn tại.');
    const lessonId=id();transaction(()=>{
      run('INSERT INTO lessons VALUES (?,?,?,?,?,?,?)',lessonId,b.courseId,b.moduleId,b.title,b.summary,encode({...b.content,editorialStatus:'manually-reviewed'}),encode(b.sourceReferences));
      for(const e of b.exercises)run('INSERT INTO exercises VALUES (?,?,?,?,?,?,?,?)',e.id,lessonId,e.type,e.prompt,typeof e.answer==='string'?e.answer:encode(e.answer),e.explanation,e.supplemental?1:0,encode(e.options||[]));
    });res.status(201).json({lesson:lessonView(one('SELECT * FROM lessons WHERE id=?',lessonId)!)});
  });
  app.get('/api/search',(req,res)=>{
    const q=z.string().trim().max(200).parse(req.query.q||'');
    const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    const found=all("SELECT d.* FROM documents d WHERE d.name LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM source_references r WHERE r.document_id=d.id AND r.text LIKE ? ESCAPE '\\') ORDER BY d.name LIMIT 200",pattern,pattern,pattern);
    res.json({documents:found.map(documentView),query:q,limit:200});
  });
  app.get('/api/documents/:id',(req,res)=>{
    const d=one('SELECT * FROM documents WHERE id=?',req.params.id);if(!d)throw message('Không tìm thấy tài liệu.',404);res.json({document:documentView(d),references:references(d.id),jobs:all('SELECT * FROM document_import_jobs WHERE document_id=? ORDER BY created_at',d.id)});
  });
  app.get('/api/documents/:id/file',(req,res)=>{
    const d=one('SELECT * FROM documents WHERE id=?',req.params.id);if(!d)throw message('Không tìm thấy tài liệu.',404);
    res.download(path.join(storage,d.storage_name),d.name);
  });
  app.post('/api/documents',async(req,res,next)=>{try{
    if(!Buffer.isBuffer(req.body)||!req.body.length)throw message('Cần gửi file với Content-Type application/octet-stream.');
    let name:string;try{name=decodeURIComponent(String(req.headers['x-file-name']||''));}catch{throw message('Tên file không hợp lệ.');}
    if(name.length>180 || !name || invalidFilename(name) || name.startsWith('.'))throw message('Tên file không hợp lệ.');
    const ext=path.extname(name).toLowerCase(),b=req.body as Buffer;
    const allowed=['.ppt','.pptx','.pdf','.doc','.docx','.txt','.md','.csv','.cpp','.h','.py','.js','.ts','.json'];
    if(!allowed.includes(ext))throw message('Định dạng chưa được hỗ trợ.');
    const ole=['.ppt','.doc'].includes(ext),zip=['.pptx','.docx'].includes(ext);
    if(ole&&b.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')throw message('File Office cũ không đúng định dạng.');
    if(zip&&b.subarray(0,4).toString('hex')!=='504b0304')throw message('File Office không đúng định dạng ZIP.');
    if(ext==='.pdf'&&b.subarray(0,5).toString()!=='%PDF-')throw message('File PDF không đúng định dạng.');
    if(!ole&&!zip&&ext!=='.pdf'&&b.includes(0))throw message('File văn bản chứa dữ liệu nhị phân.');
    const sha=hash(b),existing=one('SELECT * FROM documents WHERE sha256=?',sha);
    if(existing){run('INSERT INTO document_import_jobs VALUES (?,?,?,?,?,?)',id(),existing.id,name,'duplicate','Trùng SHA-256; giữ tài liệu đã có.',now());return res.json({duplicate:true,document:documentView(existing)});}
    const courseId=req.headers['x-course-id']?String(req.headers['x-course-id']):null;
    if(courseId&&!one('SELECT id FROM courses WHERE id=?',courseId))throw message('Môn học không tồn tại.');
    const documentId=id(),storageName=id()+ext;
    let refs:Row[]=[],limitations=['Chưa trích xuất được nội dung. Có thể tải file gốc và phân loại thủ công.'];
    if(!ole&&!zip&&ext!=='.pdf'){
      const text=b.toString('utf8');if(text.includes('\ufffd'))throw message('Hãy chuyển file văn bản sang UTF-8.');
      refs=text.split(/\n\s*\n/).filter(Boolean).map((text,i)=>({id:`${documentId}-ref-${i+1}`,slide:null,location:`Đoạn ${i+1}`,text}));limitations=[];
    } else if(ext==='.ppt') {
      try {
        const extractor=await import('../tools/ppt.mjs');
        const extraction=extractor.extractPpt(b);
        refs=extraction.references||[];limitations=extraction.limitations||['Hình, sơ đồ và công thức nhúng chưa xử lý.'];
      } catch { limitations=['Không thể trích xuất PPT này. File gốc được lưu để đọc thủ công.']; }
    }
    fs.writeFileSync(path.join(storage,storageName),b,{flag:'wx'});
    transaction(()=>{
      run('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?)',documentId,name,courseId,'',sha,b.length,storageName,refs.length?'review':'manual',encode(limitations),'',now());
      refs.slice(0,20000).forEach((r,i)=>run('INSERT INTO source_references VALUES (?,?,?,?,?)',`${documentId}-ref-${i+1}`,documentId,r.slide??null,r.location||`Bản ghi ${i+1}`,String(r.text||'').slice(0,100000)));
      run('INSERT INTO document_import_jobs VALUES (?,?,?,?,?,?)',id(),documentId,name,refs.length?'review':'manual',refs.length?'Đã trích xuất. Cần xem và xác nhận.':'Lưu file gốc; cần trích xuất thủ công.',now());
    });res.status(201).json({document:documentView(one('SELECT * FROM documents WHERE id=?',documentId)!)});
  }catch(e){next(e);}});
  app.patch('/api/documents/:id',(req,res)=>{
    const b=z.object({name:z.string().trim().min(1).max(180).optional(),courseId:z.string().nullable().optional(),description:z.string().max(4000).optional()}).parse(req.body);
    const d=one('SELECT * FROM documents WHERE id=?',req.params.id);if(!d)throw message('Không tìm thấy tài liệu.',404);
    if(b.courseId&&!one('SELECT id FROM courses WHERE id=?',b.courseId))throw message('Môn học không tồn tại.');
    if(b.name&&invalidFilename(b.name))throw message('Tên không hợp lệ.');
    run('UPDATE documents SET name=?,course_id=?,description=? WHERE id=?',b.name??d.name,b.courseId===undefined?d.course_id:b.courseId,b.description??d.description,d.id);res.json({document:documentView(one('SELECT * FROM documents WHERE id=?',d.id)!)});
  });
  app.post('/api/documents/:id/publish',(req,res)=>{
    z.object({confirmed:z.literal(true)}).parse(req.body);const d=one('SELECT * FROM documents WHERE id=?',req.params.id);if(!d)throw message('Không tìm thấy tài liệu.',404);
    if(!one('SELECT id FROM source_references WHERE document_id=?',d.id))throw message('Tài liệu chưa có văn bản để duyệt.');
    run('UPDATE documents SET status=? WHERE id=?','reviewed',d.id);run('INSERT INTO document_import_jobs VALUES (?,?,?,?,?,?)',id(),d.id,d.name,'reviewed','Người dùng xác nhận văn bản. Không tự động tạo bài học bằng AI.',now());res.json({reviewed:true,generatedLessons:0});
  });
  app.delete('/api/documents/:id',(req,res)=>{
    z.object({confirm:z.literal(true)}).parse(req.body);const d=one('SELECT * FROM documents WHERE id=?',req.params.id);if(!d)throw message('Không tìm thấy tài liệu.',404);
    const refIds=all('SELECT id FROM source_references WHERE document_id=?',d.id).map(r=>r.id);
    if(all('SELECT source_references FROM lessons').some(l=>(decode(l.source_references) as string[]).some(r=>refIds.includes(r)))||all('SELECT definition FROM challenge_cards').some(c=>(JSON.parse(c.definition).sourceReferences as string[]).some(r=>refIds.includes(r))))throw message('Tài liệu đang được bài học hoặc thẻ sử dụng; giữ nguồn để tránh mất trích dẫn.',409);
    run('DELETE FROM documents WHERE id=?',d.id); // Keep stored file for recovery; backups include only referenced files.
    res.json({deleted:true});
  });
  app.patch('/api/settings',(req,res)=>{
    const b=z.object({theme:z.enum(['dark','light']).optional(),animations:z.boolean().optional(),sound:z.boolean().optional()}).parse(req.body);
    const settings={...(decode(one('SELECT value FROM settings WHERE user_id=?','local')?.value,{}) as Row),...b};run('UPDATE settings SET value=? WHERE user_id=?',encode(settings),'local');res.json(settings);
  });
  app.post('/api/reviews/:id',(req,res)=>{
    const b=z.object({answer:z.string().max(10000),exerciseId:z.string().optional()}).parse(req.body);
    const r=one('SELECT * FROM review_schedule WHERE id=?',req.params.id);if(!r)throw message('Không tìm thấy lịch ôn.',404);
    if(r.due_at>now())throw message('Chưa tới lịch ôn. Bạn vẫn có thể luyện tập bài học.');
    const exercise=b.exerciseId?one('SELECT * FROM exercises WHERE id=? AND lesson_id=?',b.exerciseId,r.lesson_id):one('SELECT * FROM exercises WHERE lesson_id=? ORDER BY id LIMIT 1',r.lesson_id);
    if(!exercise)throw message('Bài ôn chưa có câu hỏi.');
    const result=grade(exercise,b.answer),days=result.correct?([1,3,7,14,30,60].find(day=>day>r.interval_days) || 60):1;
    const history=[...(decode(r.history) as Row[]),{at:now(),correct:result.correct,exerciseId:exercise.id}];
    run('UPDATE review_schedule SET due_at=?,interval_days=?,history=? WHERE id=?',new Date(Date.now()+days*86400000).toISOString(),days,encode(history),r.id);res.json({...result,xp:result.correct?10:0,reviews:reviews()});
  });
  app.post('/api/sessions',(req,res)=>{
    const b=z.object({lessonId:z.string(),seconds:z.number().int().min(1).max(300)}).parse(req.body);
    if(!one('SELECT id FROM lessons WHERE id=?',b.lessonId))throw message('Bài học không tồn tại.');
    const last=one('SELECT created_at FROM learning_sessions ORDER BY rowid DESC LIMIT 1');
    if(last && Date.now()-new Date(last.created_at).getTime()<b.seconds*1000-1000)throw message('Phiên học được gửi quá nhanh.',429);
    run('INSERT INTO learning_sessions VALUES (?,?,?,?,?)',id(),'local',b.lessonId,b.seconds,now());res.json({saved:true});
  });

  const makeBackup=()=>{
    const payload={schemaVersion:3,createdAt:now(),tables:Object.fromEntries(tables.map(t=>[t,all(`SELECT * FROM ${t}`)])),files:all('SELECT storage_name,sha256 FROM documents').map(d=>({name:d.storage_name,sha256:d.sha256,data:fs.readFileSync(path.join(storage,d.storage_name)).toString('base64')}))};
    return {format:'football-academy-backup',checksum:hash(encode(payload)),payload};
  };
  app.get('/api/backup',(_req,res)=>{res.setHeader('Content-Disposition',`attachment; filename="academy-backup-${now().slice(0,10)}.json"`);res.json(makeBackup());});
  app.post('/api/restore',(req,res)=>{
    if(cards.executions.busy)throw message('Hãy Dừng phiên chạy trước khi khôi phục dữ liệu.',409);
    const request=z.object({confirm:z.literal(true),backup:z.object({format:z.literal('football-academy-backup'),checksum:z.string().regex(/^[a-f0-9]{64}$/),payload:z.object({schemaVersion:z.union([z.literal(1),z.literal(2),z.literal(3)]),createdAt:z.string(),tables:z.record(z.string(),z.array(z.record(z.string(),z.unknown()))),files:z.array(z.object({name:z.string().regex(/^[a-zA-Z0-9-]+\.[a-z0-9]+$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),data:z.string()}))})})}).parse(req.body);
    const {backup}=request;
    if(!timingSafeEqual(Buffer.from(backup.checksum),Buffer.from(hash(encode(backup.payload)))))throw message('Checksum bản sao lưu không khớp.');
    if(backup.payload.schemaVersion===1){
      if(Object.keys(backup.payload.tables).sort().join()!==[...legacyTables].sort().join())throw message('Danh mục bảng cũ không hợp lệ.');
      for(const t of cardTables)backup.payload.tables[t]=[];
    }
    if(backup.payload.schemaVersion<3){
      if(Object.keys(backup.payload.tables).sort().join()!==[...legacyTables,...cardTables].sort().join())throw message('Danh mục bảng phiên bản 2 không hợp lệ.');
      for(const t of runnerTables)backup.payload.tables[t]=[];
    }
    if(Object.keys(backup.payload.tables).sort().join()!==[...tables].sort().join())throw message('Danh mục bảng không hợp lệ.');
    const columns=Object.fromEntries(tables.map(t=>[t,all(`PRAGMA table_info(${t})`).map(r=>r.name as string)]));
    let totalBytes=0;
    const files=new Map(backup.payload.files.map(f=>{
      const bytes=Buffer.from(f.data,'base64');totalBytes+=bytes.length;
      if(bytes.length>20*1024*1024 || hash(bytes)!==f.sha256)throw message('File trong bản sao lưu bị hỏng hoặc quá lớn.');
      return [f.name,{...f,bytes}];
    }));
    if(totalBytes>100*1024*1024 || files.size!==backup.payload.files.length)throw message('Bản sao lưu quá lớn hoặc trùng tên file.');
    for(const d of backup.payload.tables.documents){const f=files.get(String(d.storage_name));if(!f || f.sha256!==d.sha256 || f.bytes.length!==d.size)throw message('Metadata và file không khớp.');
      if(typeof d.name!=='string'||invalidFilename(d.name)||d.name.length>180||!Array.isArray(decode(d.limitations,null)))throw message('Metadata tài liệu không hợp lệ.');
    }
    for(const t of tables){
      if(backup.payload.tables[t].length>100000)throw message('Số lượng bản ghi vượt giới hạn.');
      for(const row of backup.payload.tables[t]){
        if(Object.keys(row).sort().join()!==[...columns[t]].sort().join())throw message(`Cột bảng ${t} không hợp lệ.`);
        if(Object.values(row).some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'))throw message('Giá trị bản ghi không hợp lệ.');
      }
    }
    if(!backup.payload.tables.users.some(u=>u.id==='local') || !backup.payload.tables.settings.some(s=>s.user_id==='local'))throw message('Thiếu tài khoản local hoặc cài đặt.');
    // Validate all rows, constraints and foreign keys in an isolated in-memory database before touching live data.
    const temporary=new DatabaseSync(':memory:');
    try {
      temporary.exec(fs.readFileSync(path.join(root,'migrations','001_initial.sql'),'utf8'));
      temporary.exec(fs.readFileSync(path.join(root,'migrations','002_challenge_cards.sql'),'utf8'));
      temporary.exec(fs.readFileSync(path.join(root,'migrations','003_runner.sql'),'utf8'));
      temporary.exec('PRAGMA foreign_keys=OFF; BEGIN;');
      for(const t of tables){const cols=columns[t];const stmt=temporary.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);for(const row of backup.payload.tables[t])stmt.run(...cols.map(c=>row[c] as any));}
      if((temporary.prepare('PRAGMA foreign_key_check').all() as Row[]).length)throw message('Bản sao lưu có liên kết dữ liệu không hợp lệ.');
      for(const row of backup.payload.tables.lessons){const content=decode(row.content,null),refs=decode(row.source_references,null);lessonSchema.parse({id:row.id,courseId:row.course_id,moduleId:row.module_id,title:row.title,summary:row.summary,content,sourceReferences:refs});}
      for(const row of backup.payload.tables.settings)z.object({theme:z.enum(['light','dark']),animations:z.boolean(),sound:z.boolean()}).parse(decode(row.value,null));
      const availableReferences=new Set(backup.payload.tables.source_references.map(r=>r.id));
      for(const row of backup.payload.tables.lessons)for(const ref of decode(row.source_references) as string[])if(!availableReferences.has(ref))throw message('Bản sao lưu thiếu nguồn bài học.');
      validateCardRows(backup.payload.tables);
      temporary.exec('COMMIT');
    }finally{temporary.close();}
    const prior=makeBackup();const backupName=`before-restore-${Date.now()}.json`;
    fs.writeFileSync(path.join(dataDir,'backups',backupName),encode(prior),{flag:'wx'});
    const remapped=new Map<string,string>();
    for(const f of files.values()) {const filename=id()+path.extname(f.name);fs.writeFileSync(path.join(storage,filename),f.bytes,{flag:'wx'});remapped.set(f.name,filename);}
    db.exec('PRAGMA foreign_keys=OFF');
    try {transaction(()=>{
      for(const t of [...tables].reverse())run(`DELETE FROM ${t}`);
      for(const t of tables){const cols=columns[t];const stmt=db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);for(const row of backup.payload.tables[t]){const r={...row};if(t==='documents')r.storage_name=remapped.get(String(r.storage_name));stmt.run(...cols.map(c=>r[c] as any));}}
      if(all('PRAGMA foreign_key_check').length)throw message('Liên kết khôi phục không hợp lệ.');
    });}finally{db.exec('PRAGMA foreign_keys=ON');}
    cards.seed();
    res.json({restored:true,preRestoreBackup:backupName});
  });
  const dist=path.join(root,'dist');
  if(fs.existsSync(dist)){
    app.use(express.static(dist));
    app.get('/{*splat}',(req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'Không tìm thấy API.'});res.sendFile(path.join(dist,'index.html'));});
  }
  app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
    const status=err instanceof z.ZodError?400:err.status || (err.code==='ERR_SQLITE_ERROR'?400:500);
    res.status(status).json({error:err instanceof z.ZodError?'Dữ liệu không hợp lệ.':status===500?'Không thể xử lý yêu cầu. Kiểm tra dữ liệu và nhật ký local.':err.message});
    if(status===500)console.error(err);
  });
  return {app,db,close:()=>{cards.close();db.close()},dataDir};
}
