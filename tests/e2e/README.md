# Kiểm thử end-to-end

Chạy **toàn bộ pipeline phiên âm** (tải từ Drive → phân tích âm thanh → chia đoạn → phiên âm → quét bổ sung → hiệu đính → đặt tên người nói → lưu → tự tạo biên bản) qua API thật của ứng dụng. Không cần Supabase, Google hay khoá AI thật.

## Chạy nhanh

```bash
# PostgreSQL 16 (kết nối TCP) + tệp chạy PostgREST v14
curl -sSL https://github.com/PostgREST/postgrest/releases/download/v14.1/postgrest-v14.1-linux-static-x86-64.tar.xz | tar -xJ -C /tmp
DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
POSTGREST_BIN=/tmp/postgrest \
tests/e2e/run.sh
```

Script tự làm lần lượt:

1. Sinh dữ liệu tổng hợp.
2. Tạo CSDL tạm, nạp stub Supabase, migration và seed.
3. Chạy PostgREST, gateway và máy chủ giả lập.
4. Build rồi chạy Next.js ở cổng 3100.
5. Chạy kiểm thử.
6. Dọn dẹp.

Thêm `E2E_KEEP=1` để giữ lại CSDL và log trong `tests/e2e/.out/`.

## Thành phần

| Tệp | Vai trò |
|---|---|
| `gateway.mjs` | Cổng Supabase giả lập ở cổng 54321: `/rest/v1` chuyển tới PostgREST (RLS thật); `/auth/v1` mô phỏng GoTrue (đăng nhập mật khẩu `E2E_PASSWORD`, mặc định `matkhau123`). `--print-keys` in khoá anon/service cố định. |
| `mock-google.mjs` | Máy chủ giả lập ở cổng 4010, gồm Google OAuth/Drive (có Range), Gemini (Files API và `streamGenerateContent`) và Soniox. Trả lời theo đáp án `gt.json`. Mô phỏng được lỗi bỏ sót (`OMIT`) và lỗi tạm thời (`FAIL_ONCE`, `FAIL_COUNT`). |
| `synthetic.mjs` | Sinh âm thanh tổng hợp 25 phút, đáp án 187 câu cho 4 người nói, và seed SQL (kết nối AI trỏ tới máy chủ giả lập). |
| `run-pipeline.mjs` | Đăng nhập bằng cookie phiên Supabase, bắt đầu phiên âm Gemini và Soniox, chờ worker nền xong rồi đối chiếu CSDL với đáp án. Gồm 18 kiểm tra. |
| `run.sh` | Điều phối toàn bộ. CI chạy script này ở job `pipeline-e2e`. |

Ứng dụng đọc các biến `GOOGLE_API_BASE_URL` và `GOOGLE_OAUTH_TOKEN_URL` để trỏ Drive sang máy chủ giả lập. Kết nối AI trỏ sang máy chủ giả lập qua trường **Base URL**.

## Thử giao diện với dữ liệu giả lập

Muốn tự bấm thử giao diện thì chạy PostgREST và `gateway.mjs` như trong `run.sh`. Sau đó trong `.env.local` đặt:

- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY` lấy từ lệnh `node tests/e2e/gateway.mjs --print-keys`

Rồi chạy `npm run dev` và đăng nhập bằng `admin@e2e.local` / `matkhau123`.
