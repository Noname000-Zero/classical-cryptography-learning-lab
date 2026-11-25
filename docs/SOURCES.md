# Nguồn và phạm vi công khai

Repository này công khai mã ứng dụng và bộ nội dung demo độc lập; không chứa tài liệu môn học private. `data/catalog.json`, `data/INVENTORY.md`, toàn bộ runtime/backup/upload và các báo cáo local nằm ngoài Git. Parser đọc tài liệu vẫn có trong mã để người dùng tự nhập nguồn mà họ có quyền sử dụng; tính năng nhập không đồng nghĩa quyền tái phân phối tài liệu.

`tools/demo-catalog.mjs` tạo 13 mục demo, không quét filesystem hoặc đọc PowerPoint. Các công thức cơ bản được mô tả ngắn để phục vụ bài thực hành; giới hạn từng thẻ được ghi trong README và đề bài. Test public dùng dữ liệu tự tạo/fixture, không cần bài giảng của bên thứ ba. Các test đối chiếu bài giảng trước đây được giữ riêng local và không công khai.

Dependency được khai báo trong package.json/package-lock.json, không vendoring vào repository: React, TypeScript, Vite, Express, Zod, Monaco Editor, Lucide, YoWASP Clang, WASI shim, Koffi và các công cụ kiểm thử. Mỗi dependency có giấy phép/notice riêng trong gói npm. Lớp ICPC là danh sách include các header chuẩn libc++, không phải bản sao header GNU libstdc++.

Tài liệu giao thức gia sư: [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Bản tích hợp chưa được nghiệm thu với mô hình thật. Kết quả trong test provider là giả lập, được ghi nhãn để kiểm tra giao thức/UI.

Không đưa bản tóm tắt lịch sử tác vụ local, đường dẫn tài khoản Windows, log, khóa hoặc dữ liệu học cá nhân vào bản public. Ảnh minh họa phải lấy từ database demo QA riêng.
