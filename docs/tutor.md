# Gia sư AI · 24/11/2026

Đã có backend hội thoại nhiều lượt theo giao thức Chat Completions tương thích OpenAI, panel cạnh Monaco (desktop >=1200px; phía dưới trên màn nhỏ), hành động menu chuột phải **Hỏi gia sư về đoạn code này**, code hiện tại, các dòng khác với bản phân tích trước, đề/ví dụ công khai và kết quả runner thật. Gia sư không có công cụ sửa/chạy code. Nút mở giải thích dùng lại bộ đọc tĩnh/mô hình cũ, không giả làm trace runtime.

**Chưa kết nối mô hình thật.** Không có nhà cung cấp/model mặc định, không đăng ký dịch vụ và không gửi code ra ngoài trong quá trình triển khai. Các test adapter dùng phản hồi MOCK rõ ràng, không chứng minh chất lượng dạy của LLM. Buổi học Caesar đủ 10 bước trong yêu cầu chưa thể nghiệm thu với gia sư thật cho đến khi người học cấu hình và đồng ý gửi dữ liệu. Runner, diagnostic, Run/Submit và mô hình Caesar hiện có vẫn chạy thật.

## Cấu hình

Chọn dịch vụ có endpoint Chat Completions và hỗ trợ `max_completion_tokens`, hoặc máy chủ mô hình local cung cấp giao thức này. Cấu hình **ở tiến trình backend**, không trong trình duyệt. App không tự đọc `.env`. Không dán khóa vào chat hoặc commit tệp chứa khóa. Nếu server cũ đang chiếm 3001, dừng đúng terminal của server bằng Ctrl+C trước khi khởi chạy lại.

```powershell
cd path\to\classical-cryptography-learning-lab
$env:TUTOR_API_URL = 'https://DIA_CHI_DICH_VU/v1/chat/completions'
$env:TUTOR_MODEL = 'TEN_MODEL_DA_CHON'
$tutorSecret = Read-Host 'API key' -AsSecureString
$env:TUTOR_API_KEY = [System.Net.NetworkCredential]::new('', $tutorSecret).Password
npm.cmd start
```

Local có thể dùng `http://127.0.0.1:PORT/v1/chat/completions` và bỏ key nếu máy chủ local không yêu cầu. Không tự cài model hoặc chọn dịch vụ trả phí. Mở http://127.0.0.1:3001, vào Đấu trường C++ → **Gia sư AI**; trạng thái phải hiện model đã cấu hình. Xem **Ngữ cảnh sẽ gửi**, nhập câu hỏi, tích đồng ý rồi gửi. Checkbox đồng ý được xóa sau mỗi lượt. Đặt hạn mức tiền tại nhà cung cấp trước khi sử dụng.

## Phạm vi và lưu trữ

- Tối đa 30.000 ký tự code, 2.000 ký tự câu hỏi, 12 tin gần nhất x 6.000 ký tự, 80.000 ký tự tổng ngữ cảnh và 1.200 token đầu ra. 1 yêu cầu đồng thời, 6/phút và 50/ngày UTC **mỗi tiến trình**; khởi động lại sẽ reset bộ đếm. Đây không phải trần chi phí tiền tệ bền vững. Timeout 30 giây, không retry tự động; lỗi vẫn có thể bị nhà cung cấp tính phí.
- Lưu 40 tin và bản code phân tích gần nhất theo thẻ/mode trong localStorage của trình duyệt, gồm câu hỏi, giải thích, gợi ý đã trao đổi. Không đưa toàn bộ lịch sử học/tài liệu nguồn vào dịch vụ AI. Lịch sử này **chưa đồng bộ SQLite, chưa có trong backup database, không có sổ theo dõi kiến thức/câu hỏi mở có cấu trúc**. Không xóa storage nếu cần giữ hội thoại. UI cảnh báo khi lưu thất bại.
- Context runner được backend đọc từ SQLite, kiểm tra user/card/mode, đánh dấu có còn khớp code không; gửi tối đa 3 case đã chạy. Không gửi bộ test ẩn trước khi chạy/nộp hoặc lời giải mẫu. Đổi thẻ/mode không trộn hội thoại. Không tự gửi yêu cầu khi gõ hoặc chạy; ở mọi chế độ đều cần bấm hỏi và đồng ý.
- Học cùng gia sư yêu cầu LLM ưu tiên một vấn đề và câu hỏi gợi mở; Tự luyện chỉ hỗ trợ khi hỏi; Luyện thi và mode Exam chặn ở backend đến khi đã nộp đúng bản code hiện tại. Những giới hạn sư phạm này phụ thuộc cả việc mô hình tuân thủ prompt, chưa được xác minh với mô hình thật.
- Trả lời AI hiển thị như văn bản, không HTML, không thực thi. Dòng AI nhắc tới chỉ được focus khi snapshot còn khớp code, có nhãn “AI đề cập”; không biến thành diagnostic compiler. AI có thể sai. Full solution cần checkbox yêu cầu riêng; lời giải mẫu hiện có vẫn chỉ mở theo thao tác của học viên.

## Nghiệm thu sau kết nối thật

1. Bài Caesar chuỗi: viết for có `;` ngay sau điều kiện, hỏi chỉ gợi ý; kiểm tra gia sư ưu tiên vấn đề đó và chờ trả lời.
2. Sửa dấu `;`, chạy thật và hỏi lại; kiểm tra gia sư nhận biết thay đổi mà không khẳng định đúng toàn bài chỉ vì compile.
3. Với công thức sai `(s[i]+k)%26`, hỏi lần lượt về biểu diễn ký tự, trừ mốc a, phần dư và cộng mốc; kiểm tra gia sư chia nhỏ, không tự đưa chương trình hoàn chỉnh.
4. Tự sửa, Run `abc\n3` → output thật `def`, Submit bộ test chính thức; yêu cầu tổng kết kiến thức.
5. Reload/đổi thẻ/quay lại để tiếp tục hội thoại, hỏi về selection; kiểm tra lỗi mất mạng và đồng ý từng lần. Luyện thi không được hỏi trước nộp.

API tham khảo: [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Backend dùng `messages`, `max_completion_tokens` và phản hồi `choices[0].message.content`; provider không tương thích sẽ báo lỗi, không tạo câu trả lời giả thay thế.
