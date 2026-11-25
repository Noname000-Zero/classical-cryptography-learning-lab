import { useEffect, useRef, useState } from 'react';
import type { EditorDiagnostic } from './CodingEditor';
export type TutorSelection={text:string;line:number;endLine:number;source:string};
type Turn={role:'user'|'assistant';content:string;source?:string};
type Memory={turns:Turn[];lastCode:string;jobId?:string;support:'guided'|'solo'|'exam'};
type Row=Record<string,any>;
export default function TutorPanel({card,mode,source,job,selection,onClose,onFocus,onExplain}:{card:Row;mode:string;source:string;job:Row|null;selection?:TutorSelection;onClose:()=>void;onFocus:(d:EditorDiagnostic)=>void;onExplain:()=>void}){
  const storageKey=`fla-tutor-v1:${card.id}:${mode}`;
  const [memory,setMemory]=useState<Memory>(()=>{try{const m=JSON.parse(localStorage.getItem(storageKey)||'null');if(m&&Array.isArray(m.turns)&&typeof m.lastCode==='string')return {...m,turns:m.turns.filter((t:Turn)=>['user','assistant'].includes(t.role)&&typeof t.content==='string').slice(-40)};}catch{/* Empty until first conversation. */}return {turns:[],lastCode:'',support:mode==='exam'?'exam':'solo'};});
  const [status,setStatus]=useState<Row|null>(null),[question,setQuestion]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(false),[full,setFull]=useState(false);
  const active=useRef(true),controller=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;void fetch('/api/tutor/status').then(r=>{if(!r.ok)throw Error();return r.json()}).then(s=>{if(active.current)setStatus(s)}).catch(()=>{if(active.current)setError('Không đọc được trạng thái gia sư.')});return()=>{active.current=false;controller.current?.abort()};},[]);
  function save(next:Memory){setMemory(next);try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError(false);}catch{setStorageError(true);}}
  useEffect(()=>{if(job?.finished&&job.id)save({...memory,jobId:job.id});},[job?.id,job?.finished]); // Never edits learner code.
  useEffect(()=>{if(selection)setQuestion('Giải thích đoạn code tôi đang chọn; cho tôi gợi ý trước.');},[selection]);
  async function ask(){
    if(!question.trim()||busy||!consent||!status?.configured)return;
    const snapshot=source,q=question;setBusy(true);setError('');controller.current=new AbortController();
    try{
      const r=await fetch(`/api/cards/${encodeURIComponent(card.id)}/tutor`,{method:'POST',signal:controller.current.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({code:snapshot,previousCode:memory.lastCode,question:q,history:memory.turns.slice(-12).map(({role,content})=>({role,content:content.slice(0,6000)})),mode,support:memory.support,jobId:job?.finished?job.id:memory.jobId,consent:true,fullSolution:full,selection:selection?.source===snapshot?{text:selection.text,line:selection.line,endLine:selection.endLine}:undefined})});
      const data=await r.json();if(!r.ok)throw Error(data.error||'Gia sư không phản hồi.');if(!active.current)return;
      save({...memory,lastCode:snapshot,turns:[...memory.turns,{role:'user' as const,content:q,source:snapshot},{role:'assistant' as const,content:data.reply,source:snapshot}].slice(-40)});setQuestion('');setFull(false);
    }catch(e){if(active.current)setError((e as Error).name==='AbortError'?'Đã dừng chờ; yêu cầu gửi tới nhà cung cấp có thể vẫn được tính phí.':(e as Error).message);}finally{if(active.current){setBusy(false);setConsent(false);}}
  }
  return <aside className="tutor-panel" aria-label="Gia sư AI">
    <div className="explanation-heading"><h3>Gia sư AI</h3><button className="text-button" onClick={onClose}>Thu gọn gia sư</button></div>
    <p className="tutor-connection" role="status">{status?.configured?`Đã cấu hình · ${status.model}`:'Gia sư AI chưa kết nối'}</p>
    {!status?.configured&&<p>Chưa thể trò chuyện với AI. Cần cấu hình dịch vụ/mô hình ở backend theo README. Phần giải thích tĩnh hiện có không phải AI hội thoại.</p>}
    <label className="field">Cách học<select aria-label="Chế độ gia sư" value={memory.support} disabled={busy||mode==='exam'} onChange={e=>save({...memory,support:e.target.value as Memory['support']})}><option value="guided">Học cùng gia sư</option><option value="solo">Tự luyện</option><option value="exam">Luyện thi</option></select></label>
    <p className="muted">{memory.support==='guided'?'Hỏi từng vấn đề, để bạn tự sửa rồi trao đổi tiếp.':memory.support==='exam'||mode==='exam'?'Chỉ phân tích sau khi Nộp bài bằng bản code hiện tại.':'Chỉ hỗ trợ khi bạn bấm gửi; không tự gửi code khi đang gõ hoặc chạy.'}</p>
    <p className="muted">Lưu tối đa 40 tin trong trình duyệt này theo thẻ/chế độ; không nằm trong backup SQLite. Mỗi lần hỏi chỉ gửi 12 tin gần nhất, code hiện tại/bản phân tích trước và kết quả liên quan.</p>
    {storageError&&<p role="alert">Không lưu được hội thoại vào trình duyệt. Đừng đóng panel nếu cần giữ trao đổi hiện tại.</p>}
    <div className="tutor-transcript" aria-label="Hội thoại gia sư">{!memory.turns.length&&<p>Đặt câu hỏi về bài “{card.title}”. Không cần chép code vào chat.</p>}{memory.turns.map((t,i)=><article key={i} className={'tutor-turn '+t.role}><b>{t.role==='user'?'Tôi':'Gia sư AI'}</b><p>{t.content}</p>{t.role==='assistant'&&<><small>AI có thể sai; đối chiếu runner. Không có trace biến thật.</small>{t.source!==source?<small>Kết luận này thuộc bản code trước.</small>:Array.from(t.content.matchAll(/dòng\s+(\d+)/gi)).slice(0,3).map((m,j)=>{const line=Number(m[1]);return line<=source.split('\n').length&&<button key={j} className="text-button" onClick={()=>onFocus({line,column:1,severity:'note',message:'Dòng AI nhắc tới — cần đối chiếu, không phải diagnostic.'})}>Xem dòng {line} (AI đề cập)</button>;})}</>}</article>)}</div>
    {selection&&<p className="notice">{selection.source===source?`Đang hỏi đoạn chọn dòng ${selection.line}–${selection.endLine}`:'Đoạn chọn thuộc bản cũ; không gửi cùng code mới.'}</p>}
    <label className="field">Hỏi gia sư<textarea aria-label="Câu hỏi cho gia sư" maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Tôi sửa thế này đúng chưa?"/></label>
    <details><summary>Ngữ cảnh sẽ gửi</summary><p>Đích: {status?.provider||'chưa cấu hình'}. Bài, ví dụ công khai, code, các dòng thay đổi, đoạn chọn còn khớp, hội thoại gần nhất, diagnostic và tối đa 3 kết quả từ runner khi bạn cung cấp phiên chạy. Không gửi tài liệu nguồn, toàn bộ lịch sử học, lời giải mẫu hay test ẩn chưa chạy.</p><pre>{source.slice(0,30000)}</pre><p>Code trên 30.000 ký tự sẽ được từ chối, không âm thầm cắt code.</p></details>
    <label className="tutor-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Tôi đồng ý gửi ngữ cảnh nêu trên tới dịch vụ đã cấu hình cho lần hỏi này (có thể tính phí).</label>
    <label className="tutor-check"><input type="checkbox" checked={full} onChange={e=>setFull(e.target.checked)}/>Tôi yêu cầu lời giải đầy đủ cho lần hỏi này.</label>
    <div className="button-row"><button className="primary" disabled={busy||!consent||!status?.configured||!question.trim()} onClick={()=>void ask()}>{busy?'Đang hỏi…':'Gửi câu hỏi'}</button>{busy&&<button className="secondary" onClick={()=>controller.current?.abort()}>Dừng chờ AI</button>}<button className="text-button" onClick={onExplain}>Mở giải thích tĩnh / mô hình</button></div>
    <p className="muted">Giới hạn: 6 lượt/phút, 50/ngày mỗi tiến trình, 1 yêu cầu đồng thời, 1.200 token đầu ra; timeout 30 giây. Đặt thêm hạn mức tiền tại nhà cung cấp.</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
  </aside>;
}
