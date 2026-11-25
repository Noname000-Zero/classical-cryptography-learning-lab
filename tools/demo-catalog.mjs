// Original demonstration curriculum. No lecture extraction or third-party documents.
import fs from 'node:fs';
const topics=[
 ['caesar','Caesar · Mã hóa','Biểu diễn ký tự theo chỉ số 0–25 rồi dịch theo khóa.','C = (P + k) mod 26'],
 ['caesar-decrypt','Caesar · Giải mã','Đảo chiều dịch để khôi phục ký tự.','P = (C - k + 26) mod 26'],
 ['caesar-brute','Caesar · Vét cạn','Liệt kê các khóa thay vì đoán duy nhất một bản rõ.','Thử khóa 1…25'],
 ['affine','Affine · Khóa và nghịch đảo','Kiểm tra khóa khả nghịch trước khi mã hóa hoặc giải mã.','C = (aP + b) mod 26; gcd(a,26)=1'],
 ['monoalphabetic','Monoalphabetic · Bảng thay thế','Mỗi ký tự được ánh xạ qua một hoán vị của bảng chữ cái.','Bảng khóa phải có đủ 26 chữ, không lặp'],
 ['playfair','Playfair · Mã hóa theo cặp','Luyện bảng khóa và xử lý từng cặp ký tự; không phải bộ xử lý văn bản Playfair đầy đủ.','Cùng hàng, cùng cột hoặc hình chữ nhật'],
 ['hill','Hill · Biến đổi ma trận','Tính tích ma trận và vector ký tự theo modulo.','C = K × P mod 26'],
 ['vigenere','Vigenère · Khóa lặp','Dịch từng ký tự với vị trí khóa lặp theo chu kỳ.','C[i] = (P[i] + K[i mod m]) mod 26'],
 ['vernam','Vernam · Phép XOR','Luyện XOR bit và chuỗi bit; an toàn OTP còn phụ thuộc điều kiện khóa.','C = P XOR K'],
 ['rail-fence','Rail Fence · Hai hàng','Tách các vị trí chẵn/lẻ và ghép lại; thẻ hiện tại giới hạn hai hàng.','Chỉ số bắt đầu từ 0'],
 ['columnar','Hoán vị cột · Lưới 3×3','Luyện đọc ma trận theo cột và hoán vị thứ tự cột.','Giữ nguyên ký tự, đổi vị trí'],
 ['feistel','Feistel · Vòng thu nhỏ','Luyện vòng Feistel trên số nguyên; không phải triển khai DES hoàn chỉnh.','L′ = R; R′ = L XOR F(R,K)'],
 ['des-aes','DES/AES · Khái niệm','Chỉ có nội dung so sánh khái niệm trong demo; chưa có mã hóa DES/AES đầy đủ.','Không dùng mật mã cổ điển để bảo vệ dữ liệu thật']
];
const lessons=topics.map(([id,title,summary,formula])=>({id,courseId:'security',moduleId:'classical',title,summary,sourceReferences:[],content:{supplemental:true,sourceNote:'Nội dung demo độc lập do dự án biên soạn, không trích bài giảng.',formula,stages:[{title:'Mục tiêu',body:summary},{title:'Nguyên lý',body:formula},{title:'Thực hành',body:'Viết code, chạy với input mẫu, đối chiếu kết quả rồi tự sửa.'}]},exercises:[]}));
fs.writeFileSync(new URL('../data/demo-catalog.json',import.meta.url),JSON.stringify({documents:[],lessons},null,2)+'\n');
console.log(`Generated ${lessons.length} original demo lessons; no documents.`);
