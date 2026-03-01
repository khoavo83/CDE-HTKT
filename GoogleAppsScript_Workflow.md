---
description: Cách tích hợp Google Apps Script OCR
---
# Hướng dẫn Thiết lập Google Apps Script OCR tự động

Hệ thống xử lý văn bản bây giờ sẽ được tách thành 2 phần độc lập:
1. **Google Apps Script (GAS):** Hoạt động ngầm trên Google Sheet. Cứ mỗi phút, nó sẽ quét thư mục "Văn bản đến/đi" trên Google Drive. Khi thấy file PDF mới tải lên, nó sẽ nạp nội dung qua Gemini API để lấy JSON OCR, điền vào file Sheet, và đồng thời bắn Webhook sang Cloud Function của bạn.
2. **Firebase Webhook:** Cloud Function Node.js mở sẵn "Endpoint" để đón nhận dữ liệu JSON từ Google Sheet bay sang và lưu vào Firestore. Dữ liệu sẽ lập tức hiện hình trên React WebApp.

## Bước 1: Chuẩn bị Google Sheet
1. Mở trình duyệt, tạo một File **Google Sheet** mới tinh.
2. Đổi tên Sheet1 thành `Database`.
3. Nhập tiêu đề cho dòng 1 (Tùy chọn, Script cũng tự ghi vào nếu chưa có):
   - A1: `File ID`
   - B1: `File Name`
   - C1: `File URL`
   - D1: `Số Ký Hiệu`
   - E1: `Ngày Ban Hành`
   - F1: `Cơ Quan`
   - G1: `Loại VB`
   - H1: `Trích Yếu`
   - I1: `Người Ký`
   - J1: `Trạng Thái (Status)` -> *Cột quan trọng để đánh dấu file đã chạy OCR hay chưa*

## Bước 2: Cài đặt Apps Script (GAS)
1. Từ file Google Sheet mới tạo, nhấn vào menu **Tiện ích mở rộng (Extensions)** > Chọn **Apps Script**.
2. Một trang Code màu trắng hiện ra. Bạn xoá dòng `function myFunction() {}` đi, và dán toàn bộ đoạn code ở file `cde-gas-ocr.js` (tôi sẽ viết cho bạn) vào đó.
3. Thay thế các biến môi trường cấu hình nằm ở trên cùng của file code:
    - Kẹp thêm **Gemini API Key**.
    - Phải lấy **Folder ID** của Thư mục "Văn bản inbox" (Id là dải chữ cái phía sau URL khi bạn truy cập thư mục mẫu trên Drive).
    - Phải có **Firebase Webhook URL** (Link Cloud Function tôi sẽ tạo).

## Bước 3: Tạo Webhook ở Firebase Cloud Function
Sửa lại source code dự án cde-webapp:
1. Tạo một hàm trigger Webhook `onCall` (hoặc `onRequest` cho dễ).
2. Chức năng: Nhận body JSON từ Google Sheet -> Tạo Document tĩnh trên bảng `vanban` với trạng thái tuỳ chỉnh (Vd: DONE_OCR).
3. Push lên Emulator hoặc Live Server. Lấy URL cung cấp ngược lại cho GAS.

## Bước 4: Hẹn giờ quét liên tục (Time-driven Trigger)
1. Trong màn hình Apps Script, biểu tượng đồng hồ tròn ở cột menu bên phải (Triggers - Các nút kích hoạt).
2. Bấm "Thêm Trình kích hoạt" (Add Trigger).
3. Đặt lịch cho sự kiện theo thời gian là: **1 phút / lần**.
4. Xong!

Lưu ý: Mọi Error và lỗi Timeout đều có Logs được báo vào môi trường Dashboard Execution bên trong Google Scripts. Trải nghiệm Up file WebApp từ giờ sẽ chỉ là hiển thị Dashboard danh sách.
