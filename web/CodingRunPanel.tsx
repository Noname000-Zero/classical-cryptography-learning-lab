import TutorPanel, { type TutorSelection } from './TutorPanel';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorDiagnostic, ExplanationLine } from './CodingEditor';
import CodeExplanationPanel from './CodeExplanationPanel';
import { createPortal } from 'react-dom';
type Row=Record<string,any>;
export type RunControls={run:()=>void;submit:()=>void};
const labels:Record<string,string>={compiling:'Đang biên dịch',running:'Đang chạy',success:'Chạy thành công',accepted:'GHI BÀN · Vượt bộ test',wrong_answer:'Sai kết quả',compile_error:'Lỗi biên dịch',runtime_error:'Lỗi runtime',timeout:'Vượt thời gian',output_limit:'Vượt dung lượng output',resource_limit:'Giới hạn CPU/RAM',runner_error:'Lỗi runner',cancelled:'Đã dừng',interrupted:'Phiên đã gián đoạn'};
async function api(url:string,method='GET',body?:unknown){const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Không thực hiện được yêu cầu.');return d;}
export default function CodingRunPanel({card,mode,getCode,flush,runner,onDone,onDiagnostics,onFocus,controls,onReset,onExplanationLine}:{card:Row;mode:string;getCode:()=>string;flush:()=>Promise<void>;runner:Row;onDone:(result:Row)=>Promise<void>;onDiagnostics:(diagnostics:EditorDiagnostic[])=>void;onFocus:(d:EditorDiagnostic)=>void;controls:MutableRefObject<RunControls|null>;onReset:()=>void;onExplanationLine:(line:ExplanationLine|undefined)=>void}){
  const [explain,setExplain]=useState(false);
  const [tutor,setTutor]=useState(false),[selection,setSelection]=useState<TutorSelection>();
  const [tutorSlot,setTutorSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{setTutorSlot(document.getElementById('academy-tutor-slot'));const ask=(e:Event)=>{setSelection((e as CustomEvent<TutorSelection>).detail);setTutor(true)};window.addEventListener('academy:ask-selection',ask);return()=>window.removeEventListener('academy:ask-selection',ask)},[]);
  const [jobSource,setJobSource]=useState('');
  const [stdin,setStdin]=useState(card.samples[0]?.input||''),[job,setJob]=useState<Row|null>(null),[error,setError]=useState(''),[starting,setStarting]=useState(false),[stale,setStale]=useState(false);
  const [toolbar,setToolbar]=useState<HTMLElement|null>(null);const resultElement=useRef<HTMLDivElement|null>(null);
  const active=useRef(true),epoch=useRef(0),currentJob=useRef<Row|null>(null),runSource=useRef('');
  const callbacks=useRef({getCode,flush,onDone,onDiagnostics});callbacks.current={getCode,flush,onDone,onDiagnostics};
  const busy=starting||!!job&&!job.finished;
  useEffect(()=>setToolbar(document.getElementById('academy-run-toolbar')),[]);
  useEffect(()=>{if(job?.finished)resultElement.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[job?.finished]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;epoch.current++;if(currentJob.current&&!currentJob.current.finished)void api(`/api/runner/jobs/${currentJob.current.id}/stop`,'POST').catch(()=>{})}},[]);
  useEffect(()=>{epoch.current++;setJob(null);currentJob.current=null;setError('');setStdin(card.samples[0]?.input||'');},[card.id,mode]);
  async function execute(action:'run'|'submit'){
    if(starting||currentJob.current&&!currentJob.current.finished||!runner.available)return;
    setStarting(true);setError('');setStale(false);callbacks.current.onDiagnostics([]);const generation=epoch.current;
    try{
      await callbacks.current.flush();runSource.current=callbacks.current.getCode();
      if(!runSource.current.trim())throw Error('Hãy viết code trước khi chạy.');
      const created=await api(`/api/cards/${encodeURIComponent(card.id)}/execute`,'POST',{code:runSource.current,stdin,mode,action});
      currentJob.current={...created,finished:false};setJobSource(runSource.current);setJob(currentJob.current);setStarting(false);
      for(;;){
        if(!active.current||generation!==epoch.current){void api(`/api/runner/jobs/${created.id}/stop`,'POST').catch(()=>{});return}
        const result=await api(`/api/runner/jobs/${created.id}`);currentJob.current=result;setJob(result);
        if(result.finished){
          const unchanged=callbacks.current.getCode()===runSource.current;setStale(!unchanged);if(unchanged)callbacks.current.onDiagnostics(result.diagnostics||[]);
          await callbacks.current.onDone(result);break;
        }
        await new Promise(resolve=>setTimeout(resolve,150));
      }
    }catch(e){if(active.current)setError((e as Error).message)}finally{if(active.current)setStarting(false)}
  }
  controls.current={run:()=>void execute('run'),submit:()=>{if(card.canSubmit)void execute('submit')}};
  const buttons=<div className="card-run-bar"><button className="secondary" aria-expanded={tutor} onClick={()=>setTutor(v=>!v)}>Gia sư AI</button><button className="primary" disabled={busy||!runner.available} onClick={()=>void execute('run')}>Chạy thử <small>Ctrl+Enter</small></button><button className="secondary" aria-expanded={explain} onClick={()=>setExplain(v=>!v)}>Giải thích từng bước</button><button className="primary" disabled={busy||!runner.available||!card.canSubmit} title={!card.canSubmit?'Thẻ chưa có bộ test ẩn được kiểm duyệt':''} onClick={()=>void execute('submit')}>Nộp bài <small>Ctrl+Shift+Enter</small></button><button className="danger" disabled={!job||job.finished} onClick={()=>void api(`/api/runner/jobs/${job!.id}/stop`,'POST').catch(e=>setError(e.message))}>Dừng</button><button className="secondary" disabled={busy} onClick={onReset}>Reset code</button></div>;
  return <section className="coding-run-panel" aria-label="Chạy và chấm code C++">
    {toolbar?createPortal(buttons,toolbar):buttons}{tutor&&tutorSlot&&createPortal(<TutorPanel card={card} mode={mode} source={getCode()} job={job} selection={selection} onClose={()=>setTutor(false)} onFocus={onFocus} onExplain={()=>setExplain(true)}/>,tutorSlot)}
    {explain&&<CodeExplanationPanel source={getCode()} stdin={stdin} card={card} evidence={job?{job,source:jobSource}:null} onLine={onExplanationLine} onFocus={onFocus} onClose={()=>setExplain(false)}/>}
    <p className="runner-provider">{runner.available?'Tương thích ICPC · bits/stdc++.h → libc++ 220106/WASI · Clang 22.1.6, GNU++17 syntax; không phải GNU G++/libstdc++ · không exceptions, threads, PBDS hoặc file/mạng máy tính':runner.reason||'Đang kiểm tra runner…'}{runner.available&&<span>64 MiB chương trình · 2 giây/test · 64 KiB output · 1 tác vụ</span>}</p>
    <label className="field">Stdin<textarea aria-label="Stdin chạy thử" value={stdin} maxLength={20000} onChange={e=>setStdin(e.target.value)} spellCheck={false}/></label><div className="button-row">{card.samples.map((s:Row,i:number)=><button key={i} className="text-button" onClick={()=>setStdin(s.input)}>Dùng input mẫu {i+1}</button>)}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {job&&<div ref={resultElement} className={'runner-results '+(job.status==='accepted'?'goal-celebration':'')} data-testid="runner-results" role="status"><h3>{labels[job.status]||job.status}{!job.finished&&<span className="spinner"/>}</h3><p>{job.feedback||`Đang xử lý ${job.testIndex?`test ${job.testIndex}/${job.tests}`:'compiler'}…`}</p>{job.xp>0&&<b className="gold">+{job.xp} XP</b>}{(stale||job.finished&&getCode()!==jobSource)&&<p className="notice">Bạn đã sửa code sau khi bấm chạy. Kết quả này thuộc bản trước; diagnostic không được gắn vào code mới.</p>}<p className="muted">Biên dịch: {job.compileMs??'…'} ms · {job.compiler||'Clang 22'}{job.peakMemoryBytes?` · Peak worker ${(job.peakMemoryBytes/1048576).toFixed(0)} MiB`:''}</p>
      {!!job.diagnostics?.length&&<div className="runner-diagnostics">{job.diagnostics.map((d:EditorDiagnostic,i:number)=><button key={i} className={'diagnostic '+d.severity} disabled={getCode()!==jobSource} onClick={()=>onFocus(d)}><b>{d.origin==='logic-suspect'?'Vị trí nghi vấn':d.severity==='warning'?'Cảnh báo':d.severity==='note'?'Ghi chú':'Lỗi'} · dòng {d.line}, cột {d.column}</b><span>{d.message}</span><small>{d.explanation}</small></button>)}</div>}
      {job.compilerStderr&&<details open={job.status==='compile_error'}><summary>Stderr compiler (nguyên văn)</summary><pre>{job.compilerStderr}</pre></details>}
      {job.results?.map((r:Row,i:number)=><details key={i} open={job.action==='run'||!r.matched}><summary>{job.action==='submit'?`Test ${i+1} · ${r.hidden?'ẩn, hiện sau nộp':'mẫu'} · ${r.matched?'Đúng':'Chưa qua'}`:'Kết quả chạy'} · {r.timeMs} ms · exit {r.exitCode}</summary><div className="comparison-grid"><div>Input<pre>{r.input||'(rỗng)'}</pre></div>{job.action==='submit'&&<div>Expected<pre>{r.expected||'(rỗng)'}</pre></div>}<div>Stdout thực tế<pre data-testid="stdout">{r.stdout||'(rỗng)'}</pre>{Array.from(String(r.stdout||'')).some(c=>c.charCodeAt(0)<32&&![9,10,13].includes(c.charCodeAt(0)))&&<pre>{JSON.stringify(r.stdout)}</pre>}</div></div><div>Stderr runtime<pre>{r.stderr||'(không có)'}</pre></div></details>)}
    </div>}
  </section>;
}
