import { compilerLabel } from './icpc-compat.mjs';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { ChallengeCard } from '../card-catalog.js';
import { WasmRunner } from './runner.js';
import { judgeCases, normalizeOutput, compilerDiagnostics, logicDiagnostics, type JudgeCase } from './judge.js';
type Row=Record<string,any>;
export class ExecutionService {
  readonly runner=new WasmRunner();
  private active=new Map<string,AbortController>();
  private closed=false;
  constructor(private db:DatabaseSync){db.prepare("UPDATE runner_executions SET status='interrupted',ended_at=? WHERE ended_at IS NULL").run(new Date().toISOString())}
  get busy(){return this.active.size>0}
  get(id:string){
    const r=this.db.prepare('SELECT * FROM runner_executions WHERE id=? AND user_id=?').get(id,'local') as Row|undefined;
    if(!r)throw Object.assign(Error('Không tìm thấy phiên chạy.'),{status:404});
    return {id:r.id,cardId:r.card_id,mode:r.mode,action:r.action,status:r.status,...JSON.parse(r.result),finished:!!r.ended_at};
  }
  cancel(id:string){this.get(id);this.active.get(id)?.abort();return {stopping:true}}
  close(){this.closed=true;for(const c of this.active.values())c.abort();}
  start(card:ChallengeCard,code:string,stdin:string,mode:string,action:'run'|'submit',onComplete:(result:Row)=>{xp:number;progress:Row}){
    if(!this.runner.availability.available)throw Object.assign(Error(this.runner.availability.reason),{status:503});
    if(this.busy)throw Object.assign(Error('Runner đang bận. Chờ phiên hiện tại hoặc bấm Dừng.'),{status:429});
    const cases:JudgeCase[]=action==='submit'?(judgeCases(card)||[]):[{input:stdin,expected:'',hidden:false}];
    if(!cases.length)throw Object.assign(Error('Thẻ tự biên soạn chưa có bộ test ẩn được kiểm duyệt. Có thể Chạy thử; chưa mở chấm điểm.'),{status:409});
    const id=randomUUID(),created=new Date().toISOString(),controller=new AbortController();this.active.set(id,controller);
    this.db.prepare('INSERT INTO runner_executions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'local',card.id,mode,action,code,stdin,'compiling','{}',created,null);
    void this.runner.run(code,cases.map(t=>t.input),controller.signal,(phase,index)=>{
      if(!this.closed)this.db.prepare('UPDATE runner_executions SET status=?,result=? WHERE id=?').run(phase==='compile'?'compiling':'running',JSON.stringify({testIndex:index+1,tests:cases.length}),id);
    }).then(raw=>{
      if(this.closed)return;
      const results=raw.results.map((r,i)=>({...r,input:cases[i]?.input||'',expected:action==='submit'?cases[i]?.expected:'',actual:r.stdout,hidden:cases[i]?.hidden||false,matched:r.status==='success'&&(action==='run'||normalizeOutput(r.stdout)===normalizeOutput(cases[i].expected))}));
      const accepted=action==='submit'&&raw.status==='success'&&results.length===cases.length&&results.every(r=>r.matched);
      const status=raw.status==='success'?(action==='run'?'success':accepted?'accepted':'wrong_answer'):raw.status;
      const diagnostics=[...compilerDiagnostics(raw.compilerStderr),...logicDiagnostics(card,code,status==='wrong_answer')];
      const outcome={...raw,status,results,diagnostics,verified:true,xp:0,jobId:id,action,compiler:compilerLabel,tests:cases.length,feedback:status==='accepted'?'Ghi bàn! Code vượt toàn bộ test chấm bài.':status==='success'?'Đã chạy thật với stdin đã chọn. Chạy thử không hoàn thành thẻ.':status==='wrong_answer'?'Code biên dịch và chạy được nhưng chưa khớp test. Kiểm tra quy ước A=0, hoa/thường, khóa âm và định dạng output.':status==='compile_error'?'Compiler báo lỗi. Xem diagnostic tại dòng/cột thật.':status==='timeout'?'Đã dừng vì vượt thời gian. Kiểm tra vòng lặp và điều kiện kết thúc.':status==='output_limit'?'Đã dừng vì output vượt 64 KiB. Kiểm tra vòng lặp in dữ liệu.':status==='cancelled'?'Đã dừng theo yêu cầu; không cấp XP.':status==='resource_limit'?'Tiến trình bị dừng do vượt giới hạn CPU/RAM hoặc thoát bất thường; không cấp XP.':'Chương trình/runner gặp lỗi. Xem stderr; không cấp XP.'};
      const completed=onComplete(outcome);Object.assign(outcome,completed);
      this.db.prepare('UPDATE runner_executions SET status=?,result=?,ended_at=? WHERE id=?').run(status,JSON.stringify(outcome),new Date().toISOString(),id);
    }).catch(e=>{
      if(!this.closed)this.db.prepare('UPDATE runner_executions SET status=?,result=?,ended_at=? WHERE id=?').run('runner_error',JSON.stringify({status:'runner_error',feedback:String(e.message||e),xp:0,results:[],diagnostics:[]}),new Date().toISOString(),id);
    }).finally(()=>this.active.delete(id));
    return {id,status:'compiling'};
  }
}
