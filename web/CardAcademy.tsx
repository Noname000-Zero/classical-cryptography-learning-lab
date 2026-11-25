import CodingRunPanel, { type RunControls } from './CodingRunPanel';
import type { EditorDiagnostic, ExplanationLine } from './CodingEditor';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import './cards.css';
import { enqueueCardWrite } from './card-drafts';
import CardAuthoring from './CardAuthoring';
const CodingEditor = lazy(() => import('./CodingEditor'));
type Mode = 'training' | 'match' | 'exam';
type Row = Record<string, any>;
const names: Record<Mode, string> = { training: 'Luyện tập · Training', match: 'Thi đấu · Match', exam: 'Kiểm tra · Exam' };
async function request(url:string, method='GET', body?:unknown) {
  const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Không thể xử lý yêu cầu.');return data;
}
const seconds=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;

export default function CardAcademy({lessonId,lessons,initialMode='training',light,onLesson,onLegacy,onRefresh}:{lessonId:string;lessons:Row[];initialMode?:Mode;light:boolean;onLesson:(id:string)=>void;onLegacy:()=>void;onRefresh:()=>Promise<void>}) {
  const [explanationLine,setExplanationLine]=useState<ExplanationLine>();
  const runControls=useRef<RunControls|null>(null);const [diagnostics,setDiagnostics]=useState<EditorDiagnostic[]>([]),[focusPoint,setFocusPoint]=useState<{line:number;column:number;seq:number}>(),[runner,setRunner]=useState<Row>({available:false}),[resetBackup,setResetBackup]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>(initialMode),[cards,setCards]=useState<Row[]>([]),[index,setIndex]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [code,setCode]=useState(''),[saved,setSaved]=useState(''),[hints,setHints]=useState<string[]>([]),[solution,setSolution]=useState(''),[result,setResult]=useState<Row|null>(null),[working,setWorking]=useState(false),[outputs,setOutputs]=useState<string[]>([]),[answer,setAnswer]=useState(''),[elapsed,setElapsed]=useState(0),[full,setFull]=useState(false);
  const [showTheory,setShowTheory]=useState(false),[source,setSource]=useState<Row|null>(null),[sourceLoading,setSourceLoading]=useState(false),[reload,setReload]=useState(0);
  const card=cards[index];
  const active=useRef(''),pending=useRef<{id:string;mode:Mode;code:string;key:string}|null>(null),saves=useRef<Promise<unknown>>(Promise.resolve()),saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const currentCode=useRef(''),currentCard=useRef<Row|null>(null),loadEpoch=useRef(0),blocked=useRef(false);

  function enqueue(draft:NonNullable<typeof pending.current>) {
    const job=enqueueCardWrite(()=>request(`/api/cards/${encodeURIComponent(draft.id)}/progress`,'PUT',{mode:draft.mode,code:draft.code}));
    saves.current=job;return job;
  }
  async function flush() {
    if(saveTimer.current)clearTimeout(saveTimer.current);
    const draft=pending.current;pending.current=null;if(draft)await enqueue(draft);
    await saves.current;
  }
  const cacheKey=(id:string,m:Mode)=>`fla-card-draft:${id}:${m}`;
  function update(value:string) {
    if(!card||blocked.current)return;
    setCode(value);currentCode.current=value;setDiagnostics([]);
    const key=cacheKey(card.id,mode),draft={id:card.id,mode,code:value,key};pending.current=draft;
    try{localStorage.setItem(key,value);}catch{/* Server autosave remains available. */}
    setSaved('Đang đồng bộ bản nháp…');if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{pending.current=null;void enqueue(draft).then(()=>{if(active.current===key)setSaved('Đã lưu bản nháp')}).catch(e=>{if(active.current===key)setSaved('Chưa đồng bộ: '+e.message)})},500);
  }
  useEffect(()=>{let live=true;setLoading(true);setError('');setSource(null);setCards([]);setIndex(0);
    void request(`/api/cards?lessonId=${encodeURIComponent(lessonId)}&mode=${mode}`).then(d=>{if(live){setCards(d.cards);setRunner(d.runner)}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[lessonId,mode,reload]);
  useEffect(()=>{
    currentCard.current=card||null;const epoch=++loadEpoch.current;
    setResult(null);setHints([]);setSolution('');setOutputs(card?.samples.map(()=> '')||[]);setAnswer('');setShowTheory(false);setSource(null);setDiagnostics([]);setResetBackup(null);
    if(!card){active.current='';return}
    const key=cacheKey(card.id,mode);active.current=key;
    let local:string|null=null;try{local=localStorage.getItem(key)}catch{/* Fall back to SQLite. */}
    const draft=local??card.progress.code??(mode==='training'?card.starterCode:'');
    currentCode.current=draft;setCode(draft);setElapsed(card.progress.activeSeconds);setSaved(local!==null?'Bản nháp cục bộ đã khôi phục':'Bản nháp đã tải');
    if(mode==='training'&&card.progress.hintsUsed)void request(`/api/cards/${encodeURIComponent(card.id)}/hints?mode=training`).then(d=>{if(epoch===loadEpoch.current)setHints(d.hints)}).catch(e=>setError(e.message));
    return()=>{if(saveTimer.current)clearTimeout(saveTimer.current);const draft=pending.current;pending.current=null;if(draft)void enqueue(draft).catch(()=>{/* Local recovery copy remains. */})};
  },[card?.id,mode]); // State changes inside the same card must never reset its draft.
  useEffect(()=>{
    if(!card)return;let live=true,token='',count=0;let lastInput=Date.now();let lastTick=Date.now();
    const activity=()=>{lastInput=Date.now()};const events=['keydown','pointerdown','pointermove'];for(const e of events)window.addEventListener(e,activity,{passive:true});
    void request(`/api/cards/${encodeURIComponent(card.id)}/session`,'POST',{mode}).then(d=>{token=d.token}).catch(e=>setError(e.message));
    const timer=setInterval(()=>{
      const current=Date.now(),delta=Math.min(2,Math.floor((current-lastTick)/1000));lastTick=current;
      if(!live||!token||document.hidden||!document.hasFocus()||current-lastInput>90000||delta<1)return;
      count+=delta;setElapsed(n=>n+delta);
      if(count>=15){const n=count;count=0;void request(`/api/cards/${encodeURIComponent(card.id)}/time`,'POST',{mode,token,seconds:n}).catch(e=>{if(live)setError('Không lưu được thời gian: '+e.message)})}
    },1000);
    return()=>{live=false;clearInterval(timer);for(const e of events)window.removeEventListener(e,activity);if(token&&count>0)void request(`/api/cards/${encodeURIComponent(card.id)}/time`,'POST',{mode,token,seconds:count}).catch(()=>{/* Partial time may be lost during shutdown. */})};
  },[card?.id,mode]);
  useEffect(()=>{
    const leave=()=>{const draft=pending.current;if(draft){void fetch(`/api/cards/${encodeURIComponent(draft.id)}/progress`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:draft.mode,code:draft.code}),keepalive:true}).catch(()=>{});}};
    window.addEventListener('pagehide',leave);
    return()=>{window.removeEventListener('pagehide',leave);leave()};
  },[]);
  // Parent backup/restore waits for all outstanding card saves before reading or replacing SQLite.
  useEffect(()=>{
    const handler=(event:Event)=>{const detail=(event as CustomEvent).detail;blocked.current=true;detail.jobs.push(flush().finally(()=>{blocked.current=false}));};
    window.addEventListener('academy:flush-drafts',handler);return()=>window.removeEventListener('academy:flush-drafts',handler);
  });
  async function act(work:()=>Promise<void>) {setWorking(true);setError('');try{await flush();await work()}catch(e){setError((e as Error).message)}finally{setWorking(false)}}
  async function move(next:number) {await act(async()=>{setIndex(next)})}
  async function changeMode(m:Mode) {await act(async()=>setMode(m))}
  async function inspectSource() {
    if(!card)return;const epoch=loadEpoch.current;setSourceLoading(true);try{const d=await request(`/api/lessons/${encodeURIComponent(card.lessonId)}`);if(epoch===loadEpoch.current)setSource(d)}catch(e){if(epoch===loadEpoch.current)setError((e as Error).message)}finally{if(epoch===loadEpoch.current)setSourceLoading(false)}
  }
  async function attempt() {
    if(!card)return;await act(async()=>{const d=await request(`/api/cards/${encodeURIComponent(card.id)}/attempts`,'POST',{mode,code:currentCode.current,kind:card.kind==='code'?'external':'answer',...(card.kind==='code'?{outputs}:{answer})});setResult(d);setCards(old=>old.map(c=>c.id===card.id?{...c,progress:d.progress}:c));await onRefresh()});
  }
  const completed=cards.filter(c=>c.progress.completed).length;
  return <section className={'card-academy'+(full?' card-fullscreen':'')}>
    <div className="card-page-heading"><div><div className="eyebrow">NHẬN THỬ THÁCH · VIẾT CODE · SỬA VÀ TIẾN BỘ</div><h1>Vào sân là lập trình<span className="gold">.</span></h1><p>Một kỹ năng mỗi thẻ. Chiến thuật luôn ở bên khi cần.</p></div><div className="button-row"><button className="secondary" onClick={()=>setFull(v=>!v)}>{full?'Thoát toàn màn hình':'Mở rộng editor'}</button><button className="text-button" onClick={()=>void act(async()=>onLegacy())}>Tài liệu & bản nháp cũ</button></div></div>
    <div className="card-toolbar"><label className="field">Bộ thẻ<select aria-label="Bộ thẻ" value={lessonId} disabled={working} onChange={e=>{const nextLesson=e.target.value;void act(async()=>onLesson(nextLesson))}}>{lessons.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label><div className="card-modes" role="group" aria-label="Chế độ luyện tập">{(Object.keys(names) as Mode[]).map(m=><button key={m} aria-pressed={mode===m} className={m===mode?'active':''} disabled={working} onClick={()=>void changeMode(m)}>{names[m]}</button>)}</div></div>
    <div className="card-progress-caption"><span>{completed}/{cards.length} thẻ được xác minh hoàn thành</span><span>{card?`Thẻ ${index+1}/${cards.length}`:'Chưa có thẻ'}</span></div><progress className="card-deck-progress" max={Math.max(1,cards.length)} value={completed} aria-label="Số thẻ được xác minh hoàn thành"/>
    {error&&<div role="alert" className="error-banner">{error}<button className="secondary" onClick={()=>location.reload()}>Tải lại</button></div>}
    {loading?<div className="loading">Đang chuẩn bị bộ thẻ…</div>:!card?<div className="panel empty"><h2>{mode==='exam'?'Chưa có bài tổng hợp trong bộ thẻ này':'Bộ thẻ chưa được biên soạn'}</h2><p>Tài liệu và bài tập cũ được giữ nguyên. Có thể học lại hoặc thêm thẻ qua API chung.</p><button className="secondary" onClick={onLegacy}>Mở nội dung cũ</button></div>:<>
      <div className="card-layout"><aside className="challenge-brief"><div className="ultimate-card"><span className="card-rating">{String(index+1).padStart(2,'0')}</span><div className="eyebrow">THỬ THÁCH HỌC VIỆN</div><h2>{card.title}</h2><div className="challenge-badges"><span>{card.difficulty==='rookie'?'Cơ bản':card.difficulty==='professional'?'Nâng cao':'Phát triển'}</span><span>{card.xp} XP khi được xác minh</span></div><p>{card.prompt}</p><small>{card.sourceReferences.length?(card.supplemental?'Bài luyện tập bổ sung · có liên kết tài liệu nguồn':'Bài tập có nguồn'):'Bài luyện tập độc lập · không kèm tài liệu bên thứ ba'}</small></div>
        <div className="card-samples"><h3>Input / output mẫu</h3>{card.samples.map((s:Row,i:number)=><div key={i}><b>Ví dụ {i+1}</b><label>Input<pre>{s.input||'(rỗng)'}</pre></label><label>Output<pre>{s.expected||'(rỗng)'}</pre></label></div>)}</div>
        <button className="secondary wide" onClick={()=>{setShowTheory(v=>!v);if(!source)void inspectSource()}} aria-expanded={showTheory}>Xem chiến thuật</button>
      </aside><div className="challenge-workspace"><div className="editor-tutor-layout"><div className="challenge-editor"><div className="editor-toolbar"><b>{card.kind==='code'?'main.cpp':'Đáp án của bạn'}</b><span>{names[mode]} · {seconds(elapsed)}</span></div>
        <div id="academy-run-toolbar" className="run-toolbar-slot"/>{mode!=='training'&&<p className="mode-note">{mode==='exam'?'Bài tổng hợp: tự viết từ đầu, không gợi ý hoặc lời giải. Thời gian được lưu; chỉ nhận điểm khi Nộp bài vượt bộ test.':'Tự viết từ đầu. Gợi ý và lời giải chỉ mở trong Training.'}</p>}
        {card.kind==='code'?<Suspense fallback={<div className="loading">Đang mở Monaco C++…</div>}><CodingEditor value={code} onChange={update} readOnly={working} light={light} diagnostics={diagnostics} explanationLine={explanationLine} focusKey={card.id+mode} focusPoint={focusPoint} onRun={()=>runControls.current?.run()} onSubmit={()=>runControls.current?.submit()}/></Suspense>:<label className="field">Câu trả lời<textarea value={answer} onChange={e=>setAnswer(e.target.value)} /></label>}
        <div className="editor-status" role="status"><span>{saved}</span><button className="text-button" disabled={working} onClick={()=>void act(async()=>{const old=await request(`/api/code/${encodeURIComponent(lessonId)}`);if(old.code===null||old.code===undefined)throw Error('Bài này chưa có bản nháp cũ.');if(!code||window.confirm('Thay code của thẻ bằng bản nháp cũ? Bản nháp cũ vẫn được giữ nguyên.'))update(old.code)})}>Chép bản nháp cũ</button></div></div>
        <div id="academy-tutor-slot"/></div>{card.kind==="code"&&<CodingRunPanel key={card.id+mode} card={card} mode={mode} getCode={()=>currentCode.current} flush={flush} runner={runner} controls={runControls} onExplanationLine={setExplanationLine} onDiagnostics={setDiagnostics} onFocus={d=>setFocusPoint({line:d.line,column:d.column,seq:Date.now()})} onDone={async outcome=>{if(outcome.progress)setCards(old=>old.map(c=>c.id===card.id?{...c,progress:outcome.progress}:c));await onRefresh()}} onReset={()=>{setResetBackup(currentCode.current);update(mode==="training"?card.starterCode:"")}}/>}{resetBackup!==null&&<button className="secondary" onClick={()=>{update(resetBackup);setResetBackup(null)}}>Hoàn tác Reset</button>}<div className="card-run-bar">{card.kind!=='code'&&<button className="primary" disabled={working} onClick={()=>void attempt()}>Kiểm tra đáp án</button>}<button className="text-button" disabled={mode!=='training'||working||hints.length>=3} onClick={()=>void act(async()=>{const d=await request(`/api/cards/${encodeURIComponent(card.id)}/hint`,'POST',{mode});setHints(d.hints);setCards(old=>old.map(c=>c.id===card.id?{...c,progress:{...c.progress,hintsUsed:d.level}}:c))})}>Gợi ý {Math.min(3,hints.length+1)}/3</button><button className="text-button" disabled={mode!=='training'||working} onClick={()=>{void act(async()=>{const d=await request(`/api/cards/${encodeURIComponent(card.id)}/solution`,'POST',{mode,confirmed:true});setSolution(d.solution)})}}>Xem lời giải</button></div>
        <div className="runner-note">Chạy thử không cấp XP. Nộp bài chấm bộ test riêng, chỉ cấp XP một lần khi vượt toàn bộ test.</div>
        {!!hints.length&&<div className="card-hints">{hints.map((h,i)=><details key={i} open><summary>Gợi ý {i+1}</summary><pre>{h}</pre></details>)}</div>}
        {solution&&<details className="panel" open><summary>Lời giải đã được yêu cầu</summary><pre>{solution}</pre></details>}
        {card.kind==='code'&&!runner.available&&<details className="external-comparison"><summary>Đối chiếu output chạy từ VS Code / IDE</summary><p>Chạy riêng từng input mẫu bằng code của bạn, rồi dán output tương ứng. Chỉ đối chiếu văn bản bạn nhập.</p>{card.samples.map((s:Row,i:number)=><label className="field" key={i}>Output thực tế của ví dụ {i+1}<textarea spellCheck={false} value={outputs[i]??''} onChange={e=>setOutputs(old=>old.map((v,j)=>j===i?e.target.value:v))} placeholder={s.expected===''?'Ví dụ này có thể cho output rỗng':'Dán output thực tế…'}/></label>)}<button className="secondary" disabled={working} onClick={()=>void attempt()}>{working?'Đang đối chiếu…':'Đối chiếu output tự nhập'}</button></details>}
        {result&&<div role="status" className={'card-result '+(result.verified&&result.xp>0?'goal-celebration':'')}><h3>{result.verified?(result.status==='correct'?'GHI BÀN · Đã xác minh':'Cần sửa và thử lại'):'Đối chiếu thủ công · Chưa xác minh code'}</h3><p>{result.feedback}</p>{result.xp>0&&<b>+{result.xp} XP</b>}{result.results.map((r:Row,i:number)=><details key={i}><summary>Ví dụ {i+1}: {r.matched?'Khớp':'Chưa khớp'}</summary><div className="comparison-grid"><div>Input<pre>{r.input||'(rỗng)'}</pre></div><div>Expected<pre>{r.expected||'(rỗng)'}</pre></div><div>Actual tự nhập<pre>{r.actual||'(rỗng)'}</pre></div></div></details>)}</div>}
        <div className="card-history"><h3>Phong độ thẻ này</h3><p>{card.progress.attempts} lần đối chiếu/nộp · {card.progress.hintsUsed} gợi ý đã mở · {seconds(elapsed)} luyện tập · {card.progress.xp} XP đã nhận</p>{card.progress.history.slice(0,5).map((a:Row)=><details key={a.id}><summary>{new Date(a.created_at).toLocaleString('vi-VN')} · {a.verified?'Đã xác minh':'Tự nhập, chưa xác minh'} · {a.status==='manual_match'?'Output khớp':a.status==='manual_mismatch'?'Output chưa khớp':(a.status==='correct'||a.status==='accepted')?'Đúng':'Cần sửa'}</summary>{a.results.map((r:Row,i:number)=><pre key={i}>{`Input: ${r.input}\nExpected: ${r.expected}\nActual: ${r.actual}`}</pre>)}</details>)}</div>
      </div></div>
      {showTheory&&<section className="panel card-theory"><div className="section-title"><h2>Chiến thuật theo yêu cầu</h2><button className="secondary" onClick={()=>setShowTheory(false)}>Thu gọn</button></div><p className="preserve">{card.theory}</p>{card.formula&&<pre>{card.formula}</pre>}{sourceLoading?<p>Đang lấy nguồn…</p>:source?<details><summary>Lý thuyết và nguồn hiện có</summary>{(source.lesson.content.stages||[]).filter((s:Row)=>s.title==='Phân tích chiến thuật').map((s:Row,i:number)=><p className="preserve" key={i}>{s.body}</p>)}{source.references.filter((r:Row)=>card.sourceReferences.includes(r.id)).map((r:Row)=><article className="source-excerpt" key={r.id}><a href={`/api/documents/${encodeURIComponent(r.documentId)}/file`} target="_blank" rel="noreferrer">{r.fileName} · {r.slide?'Slide '+r.slide:r.location}</a><p className="preserve">{r.text}</p></article>)}</details>:<p>Thẻ này chưa có nguồn được liên kết.</p>}</section>}
      <div className="card-navigation"><button className="secondary" disabled={working||index===0} onClick={()=>void move(index-1)}>Thẻ trước</button><span>Đi tiếp không tự đánh dấu hoàn thành</span><button className="primary" disabled={working||index===cards.length-1} onClick={()=>void move(index+1)}>Thẻ tiếp theo</button></div>
    </>}
    {mode==='training'&&lessonId&&<CardAuthoring lessonId={lessonId} onSaved={()=>setReload(v=>v+1)}/>}
  </section>;
}
