# MeetingAI — phiên âm và tổng hợp giao ban, họp, hội nghị

Ứng dụng web chuyển file ghi âm tiếng Việt thành văn bản, **phân vai người nói**, rồi soạn văn bản tổng hợp theo template: biên bản giao ban, biên bản họp theo NĐ 30/2020, tóm tắt hội nghị… Có hỏi đáp AI trên nội dung cuộc họp và chia sẻ theo nhóm như NotebookLM. Dùng tốt trên điện thoại và laptop.

- Kiến trúc chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Nghiên cứu công nghệ phiên âm (có trích nguồn): [docs/RESEARCH.md](docs/RESEARCH.md)

## Tính năng

### Ghi âm và lưu trữ
- Tải tệp lên (m4a, mp3, wav, …, tối đa 2 GB), hoặc ghi âm trực tiếp trên trình duyệt.
- Bản đang ghi được lưu tạm trên máy, nên mất mạng hay đóng tab vẫn khôi phục được.
- **Tệp gốc lưu nguyên vẹn trên Google Drive** của đơn vị, không nén lại.
- **Phiên âm không lưu tệp:** khi chưa kết nối hoặc không tải được lên Drive, tệp (tối đa 200 MB) chỉ được giữ tạm để phiên âm rồi tự xoá; bản ghi vẫn giữ transcript. Có thể tải tệp lên sau để nghe lại theo từng câu hoặc phiên âm lại.

### Phiên âm
- **Gemini** (mặc định):
  - chia đoạn tại khoảng lặng, với ngưỡng thích nghi theo nền ồn của từng phòng họp
  - quét lại những khoảng bị mô hình bỏ sót
  - đo và hiển thị độ phủ nội dung
  - **phân vai bằng giọng mẫu** (mặc định bật): các đoạn phiên âm lần lượt; mỗi đoạn gửi kèm vài giây giọng thật của từng người đã xác định ở đoạn trước để mô hình so giọng, nên không gán nhầm người giữa các đoạn. Chậm hơn chạy song song (bản 40 phút mất khoảng 5–7 phút thay vì ~3 phút); tắt được trong hộp thoại "Phiên âm"
- **Soniox `stt-async-v5`** (tuỳ chọn): phân vai theo đặc trưng giọng nói trên toàn bộ tệp.
- Cả hai đều có:
  - AI suy ra tên và vai trò người nói từ nội dung
  - hiệu đính thuật ngữ y khoa theo từ điển, có kiểm chứng từng chỗ sửa
- Bản máy gốc luôn được giữ, khôi phục được bất cứ lúc nào.

### Làm việc với transcript
- Trình phát tô màu theo người nói; bấm vào câu để nghe lại đúng chỗ.
- Tìm kiếm không cần dấu.
- Sửa câu, đổi hoặc gộp người nói.
- Xuất DOCX, Markdown, TXT, SRT, VTT.

### Văn bản tổng hợp
Template hệ thống:
- Transcript chi tiết (biên tập, phân vai, kiểu NotebookLM)
- Biên bản giao ban chuyên môn
- Biên bản họp theo thể thức NĐ 30/2020 (Mẫu 1.9)
- Tóm tắt hội nghị
- Kết luận và phân công
- Tóm tắt nhanh
- Bài học lâm sàng

Có thể thêm template tuỳ chỉnh theo cá nhân, nhóm hoặc đơn vị. Văn bản xuất ra DOCX khổ A4, lề và phông theo NĐ 30.

### Hỏi đáp AI
- Hỏi trên một bản ghi, hoặc trên nhiều bản ghi trong nhóm.
- Câu trả lời có trích dẫn mốc thời gian `[R1 05:23]`; bấm vào để nghe lại đoạn đó.

### Cộng tác
- Nhóm: chia sẻ bản ghi (quyền xem hoặc sửa), hỏi đáp chung, chat nhóm, mời thành viên bằng liên kết.
- Chat 1-1.
- Ghi chú cá nhân gắn mốc thời gian.

### Kết nối AI
- Nhà cung cấp: Gemini, OpenAI, Claude, **DeepSeek**, API tương thích OpenAI (OpenRouter, vLLM…), Soniox.
- Mỗi kết nối:
  - tự tải danh sách mô hình mới nhất, hoặc nhập tay tên mô hình và base URL
  - chỉnh tham số: mức suy luận, độ chi tiết, temperature, top-p, max tokens, JSON nâng cao
  - Gemini: khai báo **mô hình dự phòng khi quá tải** (vd `gemini-2.5-flash`) — mô hình mới thường hay báo 503 "high demand"
  - có nút **kiểm tra kết nối** và **lưu**
- **Mỗi vị trí dùng AI chọn mô hình riêng** (phiên âm, nhận diện tên, hiệu đính, báo cáo, hỏi đáp), trong số các kết nối đã kiểm tra thành công.

## Triển khai

Cần có:
- một project **Supabase** (khuyến nghị đặt ở Singapore)
- một project **Google Cloud**
- một tài khoản **Vercel**
- kho mã này trên GitHub

### Bước 1. Supabase

1. Tạo project. Vào **Project Settings → API Keys**, lấy **publishable key** (`sb_publishable_…`) và **secret key** (`sb_secret_…`). Khoá cũ anon/service_role vẫn dùng được.
2. Chạy migration: mở **SQL Editor**, lần lượt dán nội dung từng tệp trong [`supabase/migrations/`](supabase/migrations) (theo thứ tự tên tệp) rồi bấm **Run**. Nếu dùng Supabase CLI thì chạy `supabase link` rồi `supabase db push`.
   - Khi cập nhật ứng dụng, chỉ cần chạy thêm các tệp migration mới (vd `20260926000000_temp_audio.sql` tạo bucket lưu tạm `audio-temp`). **Quản trị → Kiểm tra** báo mục nào còn thiếu.
   - Có thể làm bước này sau khi deploy: nếu CSDL chưa khởi tạo, ứng dụng tự mở trang **Cài đặt ban đầu**, có nút sao chép SQL và liên kết thẳng tới SQL Editor.
   - Tài khoản đã đăng ký trước khi chạy migration vẫn được tạo hồ sơ; người đăng ký sớm nhất là quản trị viên.
   - Migration tạo bảng, phân quyền RLS và bật Realtime cho chat và tiến độ phiên âm.
3. Vào **Authentication → URL Configuration**:
   - **Site URL**: `https://<tên-miền-ứng-dụng>`
   - **Redirect URLs**: thêm `https://<tên-miền-ứng-dụng>/auth/callback`, và `http://localhost:3000/auth/callback` nếu chạy thử trên máy.
4. Vào **Authentication → Sign In / Providers**:
   - Bật Email. Khi mới chạy thử, có thể tắt **Confirm email** để đăng ký xong dùng ngay; email xác nhận mặc định của Supabase bị giới hạn vài thư mỗi giờ.
   - Tuỳ chọn bật Google, dùng OAuth client ở bước 2. Redirect URI của Google là `https://<project-ref>.supabase.co/auth/v1/callback`.

### Bước 2. Google Cloud (Google Drive)

1. Tạo project, rồi bật **Google Drive API** (APIs & Services → Library).
2. Vào **Google Auth Platform** (tên cũ: OAuth consent screen):
   - **Branding:**
     - App name `MeetingAI`; User support email và Developer contact information: email của bạn.
     - **Không tải logo lên.** Có logo thì ứng dụng phải qua xác minh của Google trước khi publish.
     - Application home page `https://<tên-miền-ứng-dụng>`, Privacy policy `https://<tên-miền-ứng-dụng>/privacy`, Terms of service `https://<tên-miền-ứng-dụng>/terms`. Hai trang này có sẵn trong ứng dụng; email liên hệ hiển thị trên đó đặt ở **Quản trị → Đơn vị**.
     - Authorized domains: `<tên-miền-ứng-dụng>`, không kèm `https://` (với tên miền Vercel, nhập đầy đủ dạng `ten-du-an.vercel.app`, không nhập `vercel.app`); thêm `<project-ref>.supabase.co` nếu dùng đăng nhập Google.
   - **Audience:** chọn **External**, hoặc **Internal** nếu đơn vị dùng Google Workspace.
   - **Data Access:** thêm phạm vi `.../auth/drive.file`. Đây là phạm vi không nhạy cảm; ứng dụng chỉ thấy tệp do chính nó tạo.
   - Bấm **Publish app** (Audience) để chuyển sang *In production*. Nếu để ở *Testing*, phải thêm tài khoản Google của bạn vào **Test users** và refresh token sẽ hết hạn sau 7 ngày (xem [RESEARCH.md](docs/RESEARCH.md#5-hạ-tầng-triển-khai)).
3. Vào **Clients → Create client → Web application**, thêm **Authorized redirect URIs**:
   - `https://<tên-miền-ứng-dụng>/api/admin/drive/callback`
   - `http://localhost:3000/api/admin/drive/callback` (chạy thử trên máy)
   - `https://<project-ref>.supabase.co/auth/v1/callback` (nếu dùng client này cho đăng nhập Google)
4. Ghi lại **Client ID** và **Client secret**.

> Service account không có dung lượng lưu trữ riêng, nên ứng dụng lưu tệp bằng tài khoản Google thật do quản trị viên kết nối ở bước 4.

### Bước 3. Vercel

1. **Add New → Project**, rồi import kho GitHub này. Framework chọn Next.js; Node.js 22.
2. Đặt biến môi trường. Mẫu đầy đủ trong [`.env.example`](.env.example).

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✔ | Hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SECRET_KEY` | ✔ | Hoặc `SUPABASE_SERVICE_ROLE_KEY`. **Chỉ ở server** |
| `APP_ENCRYPTION_KEY` | ✔ | Tạo bằng `openssl rand -base64 32`. Mã hoá khoá API và token Drive. **Đổi khoá này thì phải nhập lại mọi khoá API** |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✔ | Lấy ở bước 2 |
| `APP_URL` | nên có | Ví dụ `https://meetingai.vercel.app`; worker nền dùng URL này để tự gọi |
| `CRON_SECRET` | nên có | Chuỗi ngẫu nhiên; Vercel Cron gửi kèm khi gọi watchdog |
| `WORKER_SECRET` | tuỳ chọn | Mặc định dùng `APP_ENCRYPTION_KEY` |
| `ALLOWED_EMAIL_DOMAINS` | tuỳ chọn | Ví dụ `benhvien.vn`: chỉ email thuộc tên miền này được đăng nhập |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | tuỳ chọn | Cần khi bật Deployment Protection cho tên miền mà worker gọi tới |
| `GEMINI_API_KEY`, `SONIOX_API_KEY` | tuỳ chọn | Khoá dự phòng khi chưa cấu hình kết nối AI trong giao diện |

3. Bấm **Deploy**. Sau khi có tên miền chính thức, cập nhật `APP_URL` rồi deploy lại.
4. Nên chọn **Function Region** gần Supabase (Settings → Functions), ví dụ Singapore.
5. **Cron:** [`vercel.json`](vercel.json) chạy watchdog mỗi ngày một lần, vì gói Hobby chỉ cho cron chạy 1 lần/ngày.
   - Gói Pro: đổi `schedule` thành `*/5 * * * *` để tác vụ bị treo tự khôi phục trong vài phút.
   - Gói Hobby: nếu cần khôi phục nhanh hơn, dùng một dịch vụ cron bên ngoài gọi `GET /api/cron/watchdog` kèm header `Authorization: Bearer <CRON_SECRET>`.
   - Dù dùng gói nào, trang đang mở cũng tự khôi phục tác vụ treo sau 90 giây.

### Bước 4. Cấu hình lần đầu trong ứng dụng

1. Mở ứng dụng và đăng ký. **Người đăng ký đầu tiên trở thành quản trị viên.**
2. Vào **Quản trị → Lưu trữ → Kết nối Google Drive**, chọn tài khoản Google sẽ chứa tệp ghi âm.
   - Tệp được lưu vào thư mục *MeetingAI - Ghi âm*, hoặc thư mục đặt trong `GOOGLE_DRIVE_FOLDER_ID`.
3. Vào **Quản trị → Kết nối AI → Thêm kết nối**:
   - Chọn **Google Gemini**, dán API key (lấy tại Google AI Studio).
   - Bấm **Tải danh sách mô hình**, chọn mô hình, bấm **Kiểm tra**, rồi **Lưu**.
   - Tuỳ chọn thêm Claude, DeepSeek hoặc OpenAI để soạn văn bản và hỏi đáp, Soniox để phiên âm.
4. Ở mục **Phân công mô hình**, chọn kết nối cho từng vị trí. Mỗi người dùng cũng có thể dùng khoá riêng và phân công riêng trong **Cài đặt**.
5. Vào **Quản trị → Đơn vị**, nhập tên đơn vị và cơ quan chủ quản (dùng cho phần đầu biên bản NĐ 30). Có thể bật tuỳ chọn *duyệt tài khoản mới*.
6. Tuỳ chọn: vào **Từ điển thuật ngữ**, thêm tên thuốc, thủ thuật, tên đồng nghiệp để AI viết đúng chính tả.

## Chi phí và giới hạn

### Vercel

| | Hobby | Pro |
|---|---|---|
| Thời gian chạy tối đa mỗi hàm | 300 s | 800 s |
| Cron | 1 lần/ngày | Theo phút |
| Bộ nhớ | 2 GB / 1 vCPU | 2–4 GB |

- Mỗi bước xử lý nền được giới hạn 250 s nên chạy được trên cả Hobby. Nguồn: [RESEARCH.md §5](docs/RESEARCH.md#5-hạ-tầng-triển-khai).
- Điều khoản sử dụng hợp lý của Vercel dành gói Hobby cho mục đích cá nhân, phi thương mại. Đơn vị nên kiểm tra điều khoản này trước khi dùng chính thức: https://vercel.com/docs/limits/fair-use-guidelines (chưa xác minh trực tiếp).

### Chi phí AI mỗi giờ âm thanh (ước tính)

| Cấu hình | Chi phí |
|---|---|
| Gemini 3.8 Flash (phiên âm + hậu kiểm) | ~$0,25–0,30 |
| Soniox + LLM hậu kiểm | ~$0,20–0,31 |

- Văn bản tổng hợp tính thêm theo mô hình được chọn.
- Chi tiết và nguồn: [RESEARCH.md §8](docs/RESEARCH.md#8-chi-phí-ước-tính-cho-mỗi-giờ-âm-thanh).

### Giới hạn khác

- **Google Drive** có dung lượng theo tài khoản: 15 GB miễn phí, hoặc theo gói Google One/Workspace. Một giờ ghi âm m4a khoảng 30–60 MB.
- **Phiên âm không lưu tệp:** tệp tạm nằm trong Supabase Storage (gói Free: 1 GB) cho tới khi phiên âm xong; tệp tối đa 200 MB. Tệp tạm chưa được phiên âm tự xoá sau 7 ngày (cron hằng ngày).
- **Dữ liệu người bệnh:** chỉ dùng gói trả phí của nhà cung cấp AI. Ở gói miễn phí của Gemini, nội dung có thể được dùng để cải thiện sản phẩm (xem [RESEARCH.md](docs/RESEARCH.md)).

## Phát triển trên máy

```bash
npm ci
cp .env.example .env.local   # điền Supabase, APP_ENCRYPTION_KEY, Google OAuth
npm run dev                  # http://localhost:3000
```

| Lệnh | Việc |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Sinh kiểu route (`next typegen`) và kiểm tra TypeScript |
| `npm test` | Unit test (vitest), gồm cả test ffmpeg trên âm thanh tổng hợp |
| `npm run build` | Build production |
| `DATABASE_ADMIN_URL=postgresql://postgres@localhost:5432/postgres scripts/test-db.sh` | Chạy migration và kiểm thử phân quyền (RLS) trên PostgreSQL 16 |

**Kiểm thử pipeline trọn vẹn không cần Supabase, Google hay khoá AI thật:**

```bash
DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres POSTGREST_BIN=/tmp/postgrest tests/e2e/run.sh
```

Lệnh này dựng CSDL tạm, PostgREST, gateway Supabase giả lập và máy chủ giả lập Google/Gemini/Soniox, rồi phiên âm một bản ghi tổng hợp 25 phút. Kết quả được đối chiếu với đáp án (18 kiểm tra). Chi tiết xem [tests/e2e/README.md](tests/e2e/README.md).

CI (GitHub Actions) chạy trên mỗi pull request:
- lint, typecheck, unit test, build
- kiểm thử RLS trên PostgreSQL 16
- kiểm thử pipeline e2e

## Cấu trúc thư mục

```
src/app/                  Trang (App Router) và API routes
  (app)/                  Khu vực đã đăng nhập: bản ghi, nhóm, chat, ghi chú, template, từ điển, cài đặt, quản trị
  api/internal/worker     Worker xử lý nền (bước phiên âm)
src/components/           Giao diện (ui/, recordings/, ai/, chat/, groups/, player/…)
src/lib/transcription/    Pipeline: chia đoạn, ghép, độ phủ, người nói, Gemini/Soniox, prompt
src/lib/audio/ffmpeg.ts   Phân tích âm thanh, cắt và mã hoá đoạn
src/lib/ai/               Lớp AI đa nhà cung cấp, kết nối, phân công
src/lib/reports/          Template và soạn văn bản tổng hợp
src/lib/drive/            Google Drive (OAuth, upload resumable, stream Range)
supabase/migrations/      Lược đồ CSDL, RLS, RPC
tests/db/                 Kiểm thử phân quyền SQL
docs/                     Kiến trúc, nghiên cứu công nghệ
```
