import { useEffect, useMemo, useRef, useState } from 'react';
import { explainSource, outputDifference, simulateCaesar, type Detail } from './code-explanation';
import type { ExplanationLine, EditorDiagnostic } from './CodingEditor';
type Row = Record<string, any>;
export default function CodeExplanationPanel({ source, stdin, card, evidence, onLine, onFocus, onClose }: {
  source: string; stdin: string; card: Row; evidence: { job: Row; source: string } | null;
  onLine: (line: ExplanationLine | undefined) => void; onFocus: (d: EditorDiagnostic) => void; onClose: () => void;
}) {
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  const [snapshot, setSnapshot] = useState(source), [kind, setKind] = useState<'static' | 'simulation'>('static');
  const [detail, setDetail] = useState<Detail>('basic'), [position, setPosition] = useState(0);
  const character = card.id === 'card-caesar-character';
  const initial = stdin.replaceAll('\r', '').split('\n');
  const [text, setText] = useState(character ? (stdin.trim().split(/\s+/)[0] || '') : initial[0]);
  const [key, setKey] = useState(character ? (stdin.trim().split(/\s+/)[1] || '3') : (initial[1]?.trim().split(/\s+/)[0] || '3'));
  const [decrypt, setDecrypt] = useState(card.id === 'card-caesar-decrypt' || /\bD\s*$/.test(stdin));
  const reading = useMemo(() => explainSource(snapshot), [snapshot]);
  const simulation = useMemo(() => simulateCaesar(text, key, decrypt), [text, key, decrypt]);
  const supportsCaesar = card.lessonId === 'caesar';
  const steps = kind === 'static' ? reading : simulation.steps;
  const index = Math.min(position, Math.max(0, steps.length - 1));
  const line = reading[index], step = simulation.steps[index], stale = source !== snapshot;
  useEffect(() => {
    onLine(kind === 'static' && !stale && line ? { line: line.line, source: snapshot } : undefined);
    return () => onLine(undefined);
  }, [kind, stale, line, snapshot, onLine]);
  function refresh() { setSnapshot(source); setPosition(0); }
  function sample() {
    setText(character ? (stdin.trim().split(/\s+/)[0] || '') : stdin.replaceAll('\r', '').split('\n')[0]);
    setKey(character ? (stdin.trim().split(/\s+/)[1] || '') : (stdin.replaceAll('\r', '').split('\n')[1]?.trim().split(/\s+/)[0] || ''));
    setDecrypt(card.id === 'card-caesar-decrypt' || /\bD\s*$/.test(stdin)); setPosition(0);
  }
  const job = evidence?.job, sameEvidence = evidence?.source === source;
  return <section className="code-explanation" aria-label="Giải thích code" data-testid="code-explanation">
    <div className="explanation-heading" ref={heading}><div><span className="explanation-badge">{kind === 'static' ? 'Giải thích tĩnh' : 'Minh họa thuật toán'}</span><h3>Hiểu từng bước</h3></div><button className="text-button" onClick={onClose}>Đóng giải thích</button></div>
    <p className="muted">Chưa tích hợp debugger hay trace giá trị biến. Output, test và diagnostic bên dưới là dữ liệu thực thi thật; các bước đọc mã và mô hình được ghi nhãn riêng.</p>
    <div className="explanation-options">
      <label className="field">Chế độ<select aria-label="Chế độ giải thích" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setPosition(0); }}><option value="static">Giải thích tĩnh · mã của bạn</option>{supportsCaesar && <option value="simulation">Minh họa Caesar · mô hình độc lập</option>}</select></label>
      <label className="field">Mức giải thích<select aria-label="Mức giải thích" value={detail} onChange={e => setDetail(e.target.value as Detail)}><option value="basic">Giải thích cơ bản</option><option value="brief">Giải thích ngắn gọn</option><option value="advanced">Giải thích nâng cao</option></select></label>
    </div>
    {kind === 'static' ? <>
      <p>Đọc theo thứ tự dòng trong bản chụp mã, <b>không phải thứ tự thực thi</b>. Màu tím trong Monaco chỉ dòng đang đọc. Không suy ra giá trị biến, nhánh if hay số vòng lặp thực tế.</p>
      {stale && <p className="notice" role="status">Code đã thay đổi; đã bỏ đánh dấu dòng cũ. Bấm Đọc lại code hiện tại để cập nhật bản đọc.</p>}
      {line ? <article className="explanation-step" data-testid="reading-step"><h4>Dòng {line.line}</h4><pre>{line.source}</pre>{(detail === 'brief' ? line.notes.slice(0, 1) : line.notes).map((note, i) => <p key={i}>{note}</p>)}{detail === 'advanced' && <p className="notice">Bộ đọc nhận diện một số cấu trúc theo từ khóa, chưa phân tích đầy đủ cú pháp C++, macro, kiểu dữ liệu hay luồng gọi hàm. Không thể kết luận độ phức tạp hoặc tính đúng chỉ từ dòng này. Dùng diagnostic thật để kiểm tra cú pháp.</p>}</article> : <p>Chưa có lệnh để đọc. Hãy viết code rồi mở lại hoặc bấm đọc lại.</p>}
      <button className="text-button" onClick={refresh}>Đọc lại code hiện tại</button>
      {snapshot.split('\n').length > 160 && <p className="muted">Giới hạn tối đa 160 dòng có nội dung trong mỗi bản đọc.</p>}
    </> : <>
      <p className="notice"><b>Mô hình Caesar chuẩn, độc lập với mã đang viết.</b> Mô hình không chạy, không kiểm tra và không sửa code của bạn; kể cả khi code sai, mô hình vẫn thể hiện thuật toán chuẩn. Không gắn các bước mô hình vào dòng Monaco. Với thẻ vét cạn, đây chỉ là một khóa được chọn, không phải toàn bộ 25 khóa.</p>
      <div className="explanation-options"><label className="field">Chuỗi mô hình<input aria-label="Chuỗi mô hình" value={text} onChange={e => { setText(e.target.value); setPosition(0); }} /></label><label className="field">Khóa k<input aria-label="Khóa mô hình" inputMode="numeric" value={key} onChange={e => { setKey(e.target.value); setPosition(0); }} /></label><label className="field">Chiều dịch<select aria-label="Chiều dịch mô hình" value={decrypt ? 'D' : 'E'} onChange={e => { setDecrypt(e.target.value === 'D'); setPosition(0); }}><option value="E">Mã hóa</option><option value="D">Giải mã</option></select></label></div>
      <div className="button-row"><button className="text-button" onClick={sample}>Lấy từ stdin hiện tại</button><button className="text-button" onClick={() => { setText('abc'); setKey('3'); setDecrypt(false); setPosition(0); }}>Ví dụ abc, k = 3</button></div>
      {simulation.error && <p role="alert" className="error-banner">{simulation.error}</p>}
      {step && <article className="explanation-step" data-testid="simulation-step" aria-live="polite">
        <h4>{step.title}</h4><p>{step.brief}</p>{detail !== 'brief' && <p>{step.explanation}</p>}{step.formula && <pre className="expression">{step.formula}</pre>}{detail === 'advanced' && <p>{step.advanced}</p>}
        {step.condition !== undefined && <div className="condition-flow">i &lt; độ dài? → <b>{step.condition ? 'Đúng → vào thân vòng lặp' : 'Sai → thoát vòng lặp'}</b></div>}
        {step.branch && <div className="condition-flow">Chữ thường? → {step.branch === 'lower' ? <b>Đúng → mốc a</b> : <>Sai → chữ hoa? → {step.branch === 'upper' ? <b>Đúng → mốc A</b> : <b>Sai → giữ nguyên</b>}</>}</div>}
        <div className="string-visual" aria-label="Chuỗi sau bước mô phỏng">{Array.from(step.after).map((ch, i) => <span className={i === step.index ? 'changed-cell' : ''} key={i}><small>{i}</small><b>{ch === ' ' ? '␣' : JSON.stringify(ch).slice(1, -1)}</b></span>)}{!step.after && <span>Chuỗi rỗng</span>}</div>
        <div className="variable-scroll"><table className="variable-table"><caption>Trạng thái biến của mô hình</caption><thead><tr><th>Biến</th><th>Trước bước</th><th>Sau bước</th></tr></thead><tbody>{step.variables.map(v => <tr key={v.name}><th>{v.name}</th><td>{v.before}</td><td className={v.before !== v.after ? 'changed-value' : ''}>{v.after}</td></tr>)}</tbody></table></div>
        {step.branch && step.branch !== 'other' && <div className="alphabet-visual" aria-label="Bảng chữ cái Caesar"><p>Bảng chữ cái → dịch {simulation.shift} vị trí</p><div className="alphabet-scroll"><div className="alphabet-grid">{Array.from({ length: 26 }, (_, i) => { const base = step.branch === 'upper' ? 65 : 97, ch = String.fromCharCode(base + i); return <span className={ch === step.before[step.index!] ? 'changed-cell' : ''} key={i}>{ch}<small>↓</small><b>{String.fromCharCode(base + (i + simulation.shift) % 26)}</b></span>; })}</div></div></div>}
      </article>}
    </>}
    {!!steps.length && <nav className="explanation-navigation" aria-label="Điều khiển từng bước"><div className="button-row"><button className="secondary" disabled={index === 0} onClick={() => setPosition(i => Math.max(0, i - 1))}>Quay lại bước trước</button><button className="primary" disabled={index === steps.length - 1} onClick={() => setPosition(index + 1)}>Bước tiếp theo</button><button className="text-button" onClick={() => setPosition(0)}>Tua về đầu</button></div><label>Bước {index + 1}/{steps.length}<input aria-label="Timeline giải thích" type="range" min={0} max={steps.length - 1} value={index} onChange={e => setPosition(Number(e.target.value))} /></label></nav>}
    <details className="explanation-evidence" open={!!job?.finished}><summary>Đối chiếu với dữ liệu thực thi thật</summary>{!job?.finished ? <p>Chưa có kết quả hoàn tất trong phiên thẻ này. Bấm Chạy thử hoặc Nộp bài để lấy diagnostic và output thật. Chưa có trạng thái biến từ debugger.</p> : <>
      <p>Kết quả runner: <b>{job.status}</b>. Không có trace biến hay lịch sử dòng thực thi.</p>{!sameEvidence && <p className="notice">Kết quả thuộc bản code trước; không dùng để đánh dấu code hiện tại. Chạy lại sau khi sửa.</p>}
      {job.diagnostics?.map((d: EditorDiagnostic, i: number) => <div className="evidence-diagnostic" key={i}><button className="text-button" disabled={!sameEvidence} onClick={() => onFocus(d)}>{d.origin === 'logic-suspect' ? 'Vị trí nghi vấn' : 'Diagnostic compiler thật'} · dòng {d.line}, cột {d.column}</button><pre>{d.message}</pre><p>{d.explanation}</p><p>Đọc lại dòng này và dòng trước đó; kiểm tra tên, kiểu dữ liệu, dấu ngoặc và dấu chấm phẩy trước khi thử lại.</p></div>)}
      {job.results?.filter((r: Row) => job.action === 'submit' && r.matched === false && r.status === 'success').slice(0, 3).map((r: Row, i: number) => <div key={i}><h4>Test chưa khớp #{i + 1}</h4><div className="comparison-grid"><div>Input<pre>{JSON.stringify(r.input)}</pre></div><div>Expected<pre>{JSON.stringify(r.expected)}</pre></div><div>Actual<pre>{JSON.stringify(r.stdout)}</pre></div></div><p>{outputDifference(String(r.expected ?? ''), String(r.stdout ?? ''))}</p><p>Hãy lần theo ký tự hoặc giá trị đầu tiên khác nhau: dữ liệu đã đọc đúng chưa, điều kiện có chọn đúng nhánh không, và phép tính có xử lý giới hạn không? Sai output chưa đủ để xác định chính xác dòng lỗi.</p></div>)}
      {['timeout', 'resource_limit', 'output_limit', 'runtime_error'].includes(job.status) && <p>Kiểm tra điều kiện dừng, chỉ số mảng, phép chia và lượng output. Trạng thái này chưa đủ để khẳng định một dòng cụ thể gây lỗi.</p>}
      {job.status === 'accepted' && <p>Code đã vượt bộ test của thẻ, nhưng bộ test không chứng minh đúng với mọi đầu vào.</p>}
    </>}</details>
  </section>;
}
