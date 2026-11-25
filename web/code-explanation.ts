// Educational analysis only. Nothing here evaluates, compiles or debugs learner code.
export type Detail = 'basic' | 'brief' | 'advanced';
export type ReadingStep = { line: number; source: string; notes: string[] };

// Mask comments AND literals before looking for tokens. Preserve newlines/columns.
function tokens(source: string) {
  return source.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    value => value.replace(/[^\n]/g, ' '));
}
export function explainSource(source: string): ReadingStep[] {
  const raw = source.split('\n'), masked = tokens(source).split('\n');
  return masked.flatMap((text, index) => {
    const t = text.trim(); if (!t) return [];
    const notes: string[] = [];
    if (t.startsWith('#')) return [{ line: index + 1, source: raw[index], notes: [/^#\s*include\b/.test(t) ? 'Nạp khai báo từ thư viện. Dòng này được xử lý trước khi chương trình chạy.' : 'Chỉ thị tiền xử lý, được xử lý trước khi chạy. Bộ đọc này chưa mở rộng macro hoặc xét các nhánh biên dịch điều kiện.'] }];
    if (/\bmain\s*\(/.test(t)) notes.push('main là điểm bắt đầu của chương trình C++.');
    if (/\bfor\s*\(/.test(t)) notes.push('Vòng for: khởi tạo một lần → kiểm tra điều kiện → chạy thân nếu đúng → cập nhật → kiểm tra lại. Chưa xác định số vòng lặp từ phân tích tĩnh.');
    if (/\bwhile\s*\(/.test(t)) notes.push('while kiểm tra điều kiện trước mỗi lần chạy thân vòng lặp; nếu điều kiện luôn đúng, vòng có thể không kết thúc.');
    if (/\bif\s*\(/.test(t)) notes.push('if kiểm tra điều kiện: đúng thì chạy nhánh tương ứng; sai thì bỏ qua hoặc chuyển sang else. Chưa biết nhánh nào thực sự được chạy.');
    if (/\belse\b/.test(t)) notes.push('else là nhánh được chọn khi điều kiện if tương ứng sai; else if kiểm tra thêm một điều kiện.');
    if (/\b(?:cin|getchar|scanf)\b|\bgetline\s*\(/.test(t)) notes.push('Đọc dữ liệu đầu vào. cin >> thường bỏ khoảng trắng đầu; getline đọc đến hết dòng. Cần đối chiếu thứ tự đọc với stdin.');
    if (/\b(?:cout|printf|puts)\b/.test(t)) notes.push('Ghi dữ liệu ra output. Khoảng trắng, ký tự và thứ tự in ảnh hưởng kết quả test.');
    if (/\b(?:int|long|char|double|float|bool|string|vector)\b/.test(t)) notes.push('Có tên kiểu dữ liệu: xem đây là khai báo, tham số kiểu hay chuyển kiểu trong ngữ cảnh này. Biến cục bộ kiểu cơ bản chưa khởi tạo không mặc nhiên có giá trị 0.');
    if (/\[[^\]]*\]/.test(t)) notes.push('Có truy cập phần tử hoặc khai báo mảng. Chỉ số phần tử bắt đầu từ 0; cần kiểm tra giới hạn trước khi truy cập.');
    if (/%/.test(t)) notes.push('Toán tử % lấy phần dư. Trong C++, phần dư với số âm có thể âm; mẫu số 0 là không hợp lệ.');
    if (/\^/.test(t)) notes.push('Toán tử ^ với số nguyên là XOR theo bit, không phải phép lũy thừa.');
    if (/\+\+|--|(?:^|[^=!<>])=(?!=)|[+*/%-]=/.test(t)) notes.push('Có phép gán hoặc cập nhật: tính vế phải rồi ghi giá trị mới vào vế trái. Chưa có giá trị trước/sau từ runtime.');
    if (/\bbreak\b/.test(t)) notes.push('break thoát vòng lặp hoặc switch gần nhất nếu luồng thực thi đến đây.');
    if (/\bcontinue\b/.test(t)) notes.push('continue bỏ phần còn lại của lượt lặp; vòng for vẫn thực hiện bước cập nhật.');
    if (/\breturn\b/.test(t)) notes.push('return kết thúc hàm hiện tại nếu được thực hiện. Trong main, 0 thường biểu thị kết thúc bình thường.');
    if (!notes.length) notes.push(/^[{};\s]+$/.test(t) ? 'Dấu ngoặc xác định phạm vi khối lệnh.' : 'Dòng này cần đọc cùng ngữ cảnh khai báo và các dòng lân cận. Bộ đọc tĩnh chưa suy ra hành vi của cấu trúc này.');
    return [{ line: index + 1, source: raw[index], notes }];
  }).slice(0, 160);
}

export type Variable = { name: string; before: string; after: string };
export type SimulationStep = {
  title: string; brief: string; explanation: string; advanced: string;
  variables: Variable[]; before: string; after: string; index?: number;
  condition?: boolean; branch?: 'lower' | 'upper' | 'other'; formula?: string;
};
export type CaesarSimulation = { steps: SimulationStep[]; shift: number; error?: string };
export function simulateCaesar(s: string, key: string, decrypt: boolean): CaesarSimulation {
  if (s.length > 64 || Array.from(s).some(ch => ch.charCodeAt(0) > 127)) return { steps: [], shift: 0, error: 'Minh họa hỗ trợ tối đa 64 ký tự ASCII; không tự cắt bớt chuỗi của bạn.' };
  if (!/^[+-]?\d+$/.test(key.trim()) || !Number.isSafeInteger(Number(key)) || Math.abs(Number(key)) > 1000000)
    return { steps: [], shift: 0, error: 'Nhập khóa nguyên trong khoảng −1000000 đến 1000000.' };
  const k = Number(key), normalized = ((k % 26) + 26) % 26, shift = decrypt ? (26 - normalized) % 26 : normalized;
  const display = (value: string) => JSON.stringify(value);
  const steps: SimulationStep[] = [{ title: 'Khởi tạo mô hình', brief: `i = 0, độ dịch = ${shift}.`, explanation: `Chuỗi ban đầu ${display(s)}. Chuẩn hóa khóa ${k} về ${normalized}; ${decrypt ? 'giải mã đảo chiều dịch' : 'mã hóa dịch về phía trước'}. Đây là biến của mô hình Caesar, không phải biến lấy từ code của bạn.`, advanced: 'Mô hình chỉ xử lý ASCII, giữ nguyên chữ số và dấu câu. Các giá trị trung gian đều nằm trong miền số nguyên an toàn.', variables: [{ name: 'i', before: 'chưa có', after: '0' }, { name: 'k (độ dịch)', before: String(k), after: String(shift) }, { name: 's', before: display(s), after: display(s) }], before: s, after: s }];
  let current = s;
  for (let i = 0; i < s.length; i++) {
    const ch = current[i], lower = ch >= 'a' && ch <= 'z', upper = ch >= 'A' && ch <= 'Z';
    const branch = lower ? 'lower' : upper ? 'upper' : 'other';
    const base = lower ? 97 : 65, p = ch.charCodeAt(0) - base;
    const replacement = lower || upper ? String.fromCharCode(base + (p + shift) % 26) : ch;
    const after = current.slice(0, i) + replacement + current.slice(i + 1);
    steps.push({ title: `Lần ${i + 1} · kiểm tra`, brief: `${i} < ${s.length} là đúng.`, explanation: `i = ${i} vẫn nằm trong chuỗi. Đi vào thân vòng lặp để xem s[${i}] = ${display(ch)}.`, advanced: 'Với n ký tự, điều kiện vòng lặp được kiểm tra n + 1 lần, kể cả lần sai cuối cùng.', variables: [{ name: 'i', before: String(i), after: String(i) }, { name: 's', before: display(current), after: display(current) }], before: current, after: current, index: i, condition: true });
    steps.push({ title: `Lần ${i + 1} · xử lý ký tự`, brief: `${display(ch)} → ${display(replacement)}; chuỗi ${display(after)}.`, explanation: `${lower ? 'Chữ thường: dùng mốc a.' : upper ? 'Chữ hoa: dùng mốc A.' : 'Không phải chữ A–Z/a–z: giữ nguyên.'} Chỉ phần tử ở chỉ số ${i} được xét trong lượt này.`, advanced: 'Mỗi lượt xử lý một ký tự. Thuật toán Caesar chuẩn có thời gian O(n), bộ nhớ phụ O(1) khi sửa trực tiếp chuỗi. Bảng ảnh chụp để minh họa dùng thêm bộ nhớ và không phản ánh bộ nhớ chương trình C++.', variables: [{ name: 'i', before: String(i), after: String(i) }, { name: `s[${i}]`, before: display(ch), after: display(replacement) }, { name: 'k (độ dịch)', before: String(shift), after: String(shift) }, { name: 's', before: display(current), after: display(after) }], before: current, after, index: i, branch, formula: lower || upper ? `(${ch.charCodeAt(0)} − ${base} + ${shift}) % 26 = ${(p + shift) % 26}; ${base} + ${(p + shift) % 26} = ${replacement.charCodeAt(0)} (${display(replacement)})` : 'Nhánh else: không thay đổi ký tự.' });
    steps.push({ title: `Lần ${i + 1} · cập nhật i`, brief: `i: ${i} → ${i + 1}.`, explanation: 'Tăng chỉ số sau khi xử lý xong ký tự, rồi quay lại kiểm tra điều kiện.', advanced: 'Khi i bằng độ dài chuỗi, không truy cập s[i]; điều kiện phải được kiểm tra trước thân vòng lặp.', variables: [{ name: 'i', before: String(i), after: String(i + 1) }, { name: 's', before: display(after), after: display(after) }], before: after, after, index: i });
    current = after;
  }
  steps.push({ title: 'Điều kiện sai · kết thúc', brief: `${s.length} < ${s.length} là sai; kết quả ${display(current)}.`, explanation: `Thoát vòng lặp. ${s.length === 0 ? 'Chuỗi rỗng nên thân vòng lặp không chạy lần nào.' : 'Tất cả ký tự đã được xét.'} Đây là kết quả của mô hình; hãy Chạy thử để biết output thật của code.`, advanced: 'Khóa âm, khóa lớn, chuỗi rỗng và ký tự ngoài bảng chữ cái là các trường hợp nên kiểm thử riêng.', variables: [{ name: 'i', before: String(s.length), after: String(s.length) }, { name: 's', before: display(current), after: display(current) }], before: current, after: current, condition: false });
  return { steps, shift };
}

export function outputDifference(expected: string, actual: string) {
  let i = 0; while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
  return i === expected.length && i === actual.length ? 'Nội dung giống nhau.' : `Khác đầu tiên ở vị trí ${i + 1}: cần ${i < expected.length ? JSON.stringify(expected[i]) : 'kết thúc output'}, nhận ${i < actual.length ? JSON.stringify(actual[i]) : 'kết thúc output'}. Độ dài expected ${expected.length}, actual ${actual.length} (tính cả khoảng trắng và xuống dòng).`;
}
