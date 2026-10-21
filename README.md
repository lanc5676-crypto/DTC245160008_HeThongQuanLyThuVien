# Thư viện Ngọc Lan

Ứng dụng quản lý sách, độc giả và mượn/trả sách với PostgreSQL; có trang đăng nhập, API metrics cho Prometheus và log JSON để Promtail gửi tới Loki.

## Chạy nhanh với Docker

Cần cài Docker Desktop. Từ thư mục dự án, chạy:

```powershell
docker compose up --build
```

Mở các địa chỉ:

- Ứng dụng qua Nginx reverse proxy: http://localhost:8082
- Prometheus: http://localhost:9090
- Grafana Docker: http://localhost:3001 (tài khoản demo `admin` / `admin`)
- pgAdmin Docker: http://localhost:5050 (`admin@librarydemo.com` / `admin12345`)
- Loki: http://localhost:3100
- Metrics: http://localhost:8082/metrics

Nginx nhận lưu lượng ứng dụng tại cổng `8082` rồi proxy đến backend nội bộ `app:3000`; backend không còn publish cổng trực tiếp ra Windows. Tài khoản thư viện mặc định: `admin` / `admin12345`. Đổi `ADMIN_USERNAME`, `ADMIN_PASSWORD` và `JWT_SECRET` trước khi triển khai ra môi trường dùng thật. Grafana và PostgreSQL trong cấu hình mẫu cũng dùng thông tin đăng nhập demo; hãy thay đổi trước khi triển khai.

pgAdmin Docker tự đăng ký sẵn server `Library Docker` và kết nối database service `db`; mật khẩu database demo là `library`. Prometheus Docker dùng phiên bản 3.15.0, cùng phiên bản với bản Windows trong scripts, và đã được cấu hình scrape ứng dụng (`app:3000/metrics`) cùng chính Prometheus mỗi 15 giây; vào `/targets` sẽ thấy hai nhóm `library_app` và `prometheus` trong giao diện mới. Datasource Prometheus và Loki được tạo tự động trong Grafana. Ứng dụng ghi log dạng JSON ra console và `app.log`; Promtail đọc file log dùng chung và chuyển tới Loki. Trong Grafana Explore, chọn Loki và thử LogQL `{job="library"}`.

Database được nạp thêm sách và độc giả mẫu khi ứng dụng khởi động; dữ liệu mẫu có 25 đầu sách, 12 độc giả và một số phiếu mượn đang hoạt động/quá hạn. Khi tạo phiếu mượn, nhập tên người mượn trực tiếp; không bắt buộc tạo thẻ độc giả trước. Các phiếu cũ vẫn hiển thị tên người đọc đã đăng ký.

## Chạy ứng dụng không dùng Docker

Cài Node.js 20 trở lên và PostgreSQL, tạo database `library`, sau đó cấu hình biến môi trường:

```powershell
Copy-Item .env.example .env
npm install
npm start
```

Điều chỉnh `DATABASE_URL` trong `.env` cho đúng PostgreSQL cục bộ. Lần khởi động đầu tiên tạo các bảng, dữ liệu demo và tài khoản quản trị. Ứng dụng local mặc định dùng cổng `8082`: mở http://localhost:8082.

## Khởi chạy Grafana, Prometheus và pgAdmin trên Windows

Nếu dùng PostgreSQL local, chạy PowerShell từ thư mục dự án:

```powershell
.\scripts\install-local-tasks.ps1
.\scripts\start-pgadmin.ps1
```

- Ứng dụng thư viện: http://localhost:8082.
- Grafana: http://localhost:3000 (bản cài Windows dùng cổng 3000; lần đầu đăng nhập `admin` / `admin` và được yêu cầu đổi mật khẩu).
- Prometheus: http://localhost:9090; dashboard kiểm tra scrape: http://localhost:9090/targets.
- `start-pgadmin.ps1` đăng ký sẵn server `Library Demo` và mở pgAdmin 4. Khi được hỏi mật khẩu kết nối PostgreSQL, nhập `library`.

`install-local-tasks.ps1` đăng ký PostgreSQL demo, ứng dụng và Prometheus để tự khởi chạy khi đăng nhập Windows; PostgreSQL chạy trên cổng `5433`, ứng dụng chờ database sẵn sàng rồi mở cổng `8082`, và Prometheus chờ ứng dụng trước khi scrape. `start-monitoring.ps1` kiểm tra scrape và tự thêm datasource Prometheus vào Grafana; chạy script này sau khi các tác vụ đã khởi động. Grafana installer chạy như một dịch vụ Windows. Log ứng dụng và log server nằm trong `logs/` và `data/`.

Để xem Grafana/Prometheus trong cấu hình Docker Compose, dùng cấu hình container ở phần trên: khi đó Grafana chạy ở cổng `3001`, Prometheus ở `9090`, và Grafana dùng tài khoản demo `admin` / `admin`. Không dùng đồng thời Prometheus trong Docker và Prometheus local vì cùng tranh cổng `9090`.

## Chức năng

- Dashboard thống kê tổng sách, sách sẵn có, phiếu đang mượn và độc giả; hiển thị hoạt động mượn gần đây.
- Tìm kiếm, thêm, sửa và xóa sách; thêm và cập nhật thông tin độc giả.
- Tạo phiếu mượn bằng cách nhập tên người mượn, chọn sách và ngày hẹn trả; xác nhận trả để cập nhật trạng thái sách; theo dõi sách quá hạn.
- Giao diện responsive, form thao tác dạng modal và xác thực bằng cookie HttpOnly.
- `/metrics` xuất Prometheus metrics; logs thao tác và lỗi truy vấn được ghi ra console/file để Loki thu thập.
