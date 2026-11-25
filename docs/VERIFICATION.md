# Nghiệm thu bản portfolio · 25/11/2026

Kiểm tra trên Windows x64, Node.js 24, Chrome headless. Bản kiểm thử được xuất từ Git index vào thư mục riêng, không có catalog trích bài giảng, PowerPoint hoặc database cá nhân. Dependency được cài riêng bằng `npm ci --offline` từ cache; không nới quyền sandbox để dùng dependency qua junction.

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript / ESLint | Đạt |
| Production build | Đạt trong bản export và checkout local |
| Node unit/integration/runner | **19 nhóm đạt, 0 fail, 0 skip** |
| Chrome | **10 test đạt**, có luồng thật Run/Submit và layout 1920/1366/768/375px |
| Demo độc lập | 13 mục học, 28 thẻ, 0 tài liệu bên thứ ba |
| C++ | 28 lời giải chạy qua test thường/biên/ẩn; kiểm tra STL ICPC, diagnostic, timeout, RAM, output, cách ly file/network, stop |
| Tiến độ | API draft theo mode, XP một lần, migration và backup/restore trên DB tạm |
| Giải thích | Đọc tĩnh, mô hình Caesar, vòng lặp, biến, tua bước và bảo toàn code |
| Tutor | Consent, quota, multi-turn/selection/history và trạng thái chưa kết nối; **provider MOCK, chưa nghiệm thu LLM thật** |
| Chạy local | HTTP 200, schema 3, runner available; giữ loopback 127.0.0.1:3001 và DB cũ |

Ảnh README được chụp từ QA demo, đã xem để kiểm tra nội dung; không dùng ảnh tài liệu hoặc tiến độ học thật. Favicon được bổ sung để loại yêu cầu HTTP404; không bỏ qua lỗi console trong test.

Rà các blob trong index bằng `node tools/review-public.mjs`, cộng kiểm tra danh sách tệp và nội dung nhạy cảm. Không phát hiện mẫu token/khóa/đường dẫn tài khoản Windows trong các blob được công bố. Đây là kiểm tra phạm vi repository, không phải chứng nhận bảo mật độc lập.

Không công bố: bài giảng gốc, văn bản trích xuất, inventory, helper nhập tài liệu private, test gắn với tài liệu private, log/báo cáo local, `.env`, dữ liệu runtime/backup/upload, dependencies hoặc build output. Các tệp private vẫn giữ tại máy, không bị xóa.

Giới hạn: chưa thử Firefox/Safari hoặc đăng nhập lại Windows; chưa có bộ tự khởi động website; chưa có AI thật hoặc GNU G++/libstdc++ thật; chưa deploy. Muốn phục vụ Internet cần thiết kế xác thực/phân quyền/quota bền vững và kiểm toán runner, không chỉ đưa frontend lên GitHub Pages. Các test có thể chạy lại theo README.
