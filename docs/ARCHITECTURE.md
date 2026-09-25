# Kiến trúc MeetingAI

Tài liệu này mô tả cách các thành phần phối hợp. Cơ sở lựa chọn công nghệ xem [RESEARCH.md](RESEARCH.md).

## 1. Thành phần

| Thành phần | Vai trò |
|---|---|
| **Next.js 16 (App Router) trên Vercel** | Giao diện (React 19, Tailwind v4) và API (Route Handlers). Worker xử lý nền cũng là một route. |
| **Supabase** | PostgreSQL (dữ liệu, phân quyền RLS), Auth (email/Google), Realtime (chat, tiến độ phiên âm). |
| **Google Drive** | Lưu **tệp ghi âm gốc nguyên vẹn** (không nén lại) bằng tài khoản Drive của đơn vị, phạm vi `drive.file`. |
| **Nhà cung cấp AI** | Gemini, Soniox (phiên âm); Gemini, Claude, OpenAI, DeepSeek, API tương thích OpenAI (nhận diện tên, hiệu đính, báo cáo, hỏi đáp). |
| **ffmpeg (ffmpeg-static)** | Giải mã, đo âm lượng, dò khoảng lặng, cắt đoạn FLAC — chỉ đóng gói vào route worker. |

```mermaid
flowchart LR
  U[Trình duyệt<br/>điện thoại / laptop] -- "tải lên 4 MiB/khúc" --> UP[/api/recordings/:id/upload/]
  UP -- resumable upload --> GD[(Google Drive<br/>tệp gốc)]
  U -- "Range 8 MB/lần" --> AU[/api/recordings/:id/audio/] --> GD
  U <-- "RLS + Realtime" --> SB[(Supabase<br/>Postgres + Auth)]
  U -- POST --> TR[/api/recordings/:id/transcribe/]
  TR -- "self-POST + after()" --> W[/api/internal/worker/]
  W -- "bước: prepare → chunk×N → finalize → autoreport" --> W
  W --> GD
  W --> AI{{Gemini / Soniox / Claude<br/>OpenAI / DeepSeek}}
  W --> SB
  CR[Vercel Cron / watchdog trình duyệt] --> RS[/api/jobs/:id/resume · /api/cron/watchdog/] --> W
  SX[Soniox webhook] --> WH[/api/webhooks/soniox/] --> W
```

## 2. Tải lên và phát lại

- **Tải lên:** Vercel giới hạn thân request 4,5 MB, nên trình duyệt gửi từng khúc 4 MiB (bội số 256 KiB theo yêu cầu của Drive) qua `/api/recordings/[id]/upload`. Server mở **resumable session** trên Drive, chuyển tiếp từng khúc và trả `offset` kế tiếp. Mất mạng giữa chừng thì hỏi trạng thái phiên và **tiếp tục từ byte còn thiếu**.
- **Ghi âm trực tiếp:** các khúc ghi được lưu tạm vào IndexedDB, nên đóng tab hay mất điện vẫn khôi phục được. Wake Lock giữ màn hình sáng. Ghi âm tắt echo cancellation, noise suppression và AGC để giữ tín hiệu gốc.
- **Phát lại:** `/api/recordings/[id]/audio` kiểm tra quyền xem qua RLS, rồi chuyển tiếp HTTP Range sang Drive. Mỗi phản hồi `206` tối đa 8 MB, nên tua nhanh được trên cả Safari/iOS.

## 3. Pipeline phiên âm

### 3.1 Điều phối nền trên Vercel

Một hàm Vercel chạy tối đa 300 s (gói Hobby). Vì vậy mỗi **bước** là một lần gọi riêng:

1. `POST /api/internal/worker` (xác thực bằng header `x-worker-secret`) trả `202` ngay.
2. Công việc chạy trong `after()` với ngân sách thời gian 250 s.
3. Trạng thái tác vụ và từng đoạn nằm trong CSDL (`transcription_jobs`, `transcription_chunks`).

Để không bước nào chạy hai lần, mỗi bước **giành quyền** bằng hàm SQL nguyên tử `claim_job` / `claim_transcription_chunk`. Tác vụ không cập nhật quá 420 s bị coi là treo và được phép giành lại.

Khôi phục tác vụ treo, theo ba đường:

- Trang đang mở có watchdog phía trình duyệt: sau 90 s không tiến triển, nó gọi `/api/jobs/[id]/resume`.
- Vercel Cron gọi `/api/cron/watchdog`.
- Người dùng bấm "Thử lại". Các đoạn lỗi được đặt lại, đoạn đã xong được giữ.

Trạng thái tác vụ: `queued → preparing → transcribing → finalizing → done` (hoặc `error` / `canceled`).

### 3.2 Engine Gemini (mặc định)

1. **prepare**
   - **Mở tệp gốc.**
     - Tệp ≤200 MB: tải vào `/tmp`.
     - Tệp lớn hơn (vd. WAV 1–2 GB): ffmpeg đọc thẳng từ Drive qua HTTPS + Range, không chiếm `/tmp` (Vercel giới hạn 500 MB).
     - Không tạo tệp WAV trung gian.
   - **Một lượt giải mã để phân tích:**
     - Đưa về 16 kHz mono, lọc highpass 70 Hz.
     - Đo RMS từng khung 100 ms, suy ra thời lượng thực và âm lượng trung bình.
     - Lấy nền ồn = bách phân vị 10, mức lời nói = bách phân vị 90.
     - **Ngưỡng lặng** = nền ồn + 25% khoảng cách tới mức lời nói (tối thiểu +3 dB), giới hạn [−60, −20] dB.
     - Khoảng lặng là chuỗi khung dưới ngưỡng dài ≥0,5 s.
     - Ví dụ bản ghi giao ban hội trường 40 phút: nền −40 dB, lời −23,7 dB → ngưỡng −35,9 dB, 18% thời lượng là khoảng lặng; mất khoảng 3,4 s CPU.
   - **Lập kế hoạch đoạn:**
     - Mỗi đoạn khoảng 10 phút (tuỳ chỉnh), **cắt ở giữa khoảng lặng** trong vùng ±90 s.
     - Đoạn cuối không ngắn hơn 2 phút.
     - Không tìm được khoảng lặng thì cắt cứng và chồng lấn 8 s.
   - **Mã hoá từng đoạn:**
     - Cắt thẳng từ tệp gốc sang FLAC 16 kHz mono 16-bit, khoảng 11 MB mỗi 10 phút.
     - Mặc định **cân bằng âm lượng tuyến tính**: cùng một mức khuếch đại cho cả bản ghi, đưa âm lượng trung bình về khoảng −22 dBFS, có chặn đỉnh. Cách này giữ nguyên động học giọng nói và nhanh gấp khoảng 28 lần `loudnorm` một lượt.
     - Tuỳ chọn khác: `dynaudnorm` (người nói xa micro) hoặc giữ nguyên.
     - **Không khử nhiễu mặc định.**
   - Tải từng đoạn lên Gemini Files API, rồi xoá tệp tạm ngay.
2. **chunk ×N**
   - Đoạn 0 chạy trước để lập **danh sách người nói**.
   - Các đoạn sau (tối đa 3 đoạn song song) nhận danh sách này kèm tên người tham dự và từ điển thuật ngữ.
   - Đầu ra là JSON theo schema: câu `{start, end, speaker, text}` và người nói.
   - JSON bị cắt ngang được sửa rồi gắn cờ.
   - **Thử lại có giãn cách:**
     - Đoạn lỗi được trả về hàng chờ kèm `next_attempt_at`. Chờ 10 s rồi 20 s; lỗi 429 thì 30 s rồi 60 s.
     - SQL không cho worker nào nhận đoạn trước hạn đó.
     - Sau 3 lần vẫn lỗi thì tác vụ báo lỗi. Nút "Thử lại" chỉ xử lý tiếp các đoạn lỗi, giữ nguyên các đoạn đã xong.
3. **finalize**
   - Ghép các đoạn:
     - chuyển mốc thời gian về tuyệt đối
     - bỏ câu trùng ở vùng chồng lấn (so khớp văn bản)
     - cắt vòng lặp lặp lại
     - thống nhất người nói giữa các đoạn theo tên
   - **Đo độ phủ**: so vùng có tiếng nói (từ khoảng lặng) với vùng đã có chữ.
     - Khoảng hở lớn được **phiên âm bổ sung**, tối đa 10 cửa sổ.
     - Câu bổ sung gắn cờ `gap_fill`.
   - **Hiệu đính thuật ngữ** (tuỳ chọn): LLM chỉ đề xuất sửa, mã kiểm chứng từng đề xuất (khoảng cách Levenshtein, khớp từ điển) trước khi áp dụng.
   - **Nhận diện tên người nói**: LLM trả JSON tên, vai trò, độ tin cậy.
     - Chỉ áp dụng tên có độ tin cậy cao hoặc vừa.
     - Chỉ gộp người nói khi độ tin cậy cao.
   - Lưu transcript:
     - `original_segments` là bản máy gốc, lấy **trước** bước AI hiệu đính thuật ngữ, không bao giờ sửa.
     - `segments` là bản đang dùng, có thể hiệu đính.
     - Kèm `quality`: độ phủ và cảnh báo.
4. **autoreport** (tuỳ chọn): tự tạo văn bản tổng hợp theo template đã chọn khi tải lên.

### 3.3 Engine Soniox (`stt-async-v5`)

- Tải lên Soniox **nguyên tệp gốc** nếu là định dạng phổ biến (m4a, mp3, wav, flac, ogg, webm…). Trường hợp khác mã hoá FLAC 16 kHz. Kèm ngữ cảnh: tên người tham dự và thuật ngữ.
- Soniox **phân vai theo đặc trưng âm học trên toàn bộ tệp**, nên người nói nhất quán suốt buổi.
- Kết quả về qua webhook (có bí mật riêng) hoặc qua thăm dò định kỳ.
- Token được gom thành câu: tách khi đổi người nói, khi ngắt quá 1,5 s, khi hết câu, hoặc khi câu dài quá 30 s.
- Sau đó chạy cùng bước hiệu đính thuật ngữ và nhận diện tên như engine Gemini.

## 4. Lớp AI

- **Kết nối** (`ai_connections`):
  - Gồm: nhà cung cấp, base URL, khoá API mã hoá AES-256-GCM, mô hình, tham số.
  - Tham số gồm: effort, verbosity, temperature, top-p, max tokens, JSON bổ sung.
  - Trạng thái kiểm tra (`ok/error/untested`) kèm độ trễ.
  - Phạm vi: `org` (dùng chung) hoặc `user` (cá nhân).
- **Phân công** (`ai_assignments`): mỗi vị trí (`transcription`, `speaker_naming`, `term_correction`, `report`, `chat`) trỏ tới một kết nối có trạng thái `ok`.
- **Thứ tự chọn kết nối khi chạy:**
  1. Kết nối người dùng chọn tại chỗ.
  2. Phân công cá nhân.
  3. Phân công đơn vị.
  4. Kết nối hợp lệ đầu tiên.
  5. Biến môi trường `GEMINI_API_KEY` / `SONIOX_API_KEY`.
- **Ánh xạ tham số theo nhà cung cấp:**
  - Gemini: effort → `thinkingLevel`.
  - OpenAI Responses API: effort → `reasoning.effort`; verbosity → `text.verbosity`.
  - Claude:
    - adaptive thinking kèm `output_config.effort`
    - prompt caching cho system prompt
    - `fallbacks: "default"` cho Opus 5 / Fable
  - DeepSeek và API tương thích OpenAI: Chat Completions (JSON qua `response_format`).
- **Danh sách mô hình** lấy trực tiếp từ API của nhà cung cấp. Người dùng vẫn nhập tay được mô hình không có trong danh sách.

## 5. Văn bản tổng hợp và hỏi đáp

- **Template:**
  - Có template hệ thống và template tuỳ chỉnh theo phạm vi cá nhân, nhóm hoặc đơn vị.
  - Prompt gồm: hướng dẫn chung, thông tin đơn vị, thông tin cuộc họp, transcript định dạng `[mm:ss] Tên (vai trò): lời`.
  - Kết quả **stream** về trình duyệt và được lưu định kỳ, nên đóng trang vẫn không mất.
- **Xuất DOCX:**
  - Khổ A4, lề trên/dưới 20 mm, trái 30 mm, phải 15 mm, Times New Roman 13, theo thể thức NĐ 30/2020.
  - Bảng không viền cho phần quốc hiệu và chữ ký.
- **Hỏi đáp:**
  - Ngữ cảnh là một bản ghi, hoặc nhiều bản ghi trong nhóm, mỗi bản ghi có mã nguồn R1, R2…
  - Có ngân sách ký tự theo mô hình.
  - Câu trả lời trích dẫn dạng `[R1 05:23]`. Giao diện biến thành nút bấm để nghe lại đúng đoạn.

## 6. Bảo mật và phân quyền

- **RLS trên mọi bảng.**
  - Hàm `SECURITY DEFINER` kiểm tra quyền (`can_view_recording`, `can_edit_recording`, `is_group_member`, …) để tránh đệ quy chính sách.
  - Quyền UPDATE cấp theo **từng cột**, nên người dùng không tự nâng vai trò hay sửa trường hệ thống được.
  - Kiểm thử tự động: `tests/db/rls-test.sql`.
- **Bí mật:**
  - Khoá API và refresh token Drive mã hoá bằng `APP_ENCRYPTION_KEY`, không bao giờ gửi về trình duyệt.
  - Worker xác thực bằng `WORKER_SECRET`, cron bằng `CRON_SECRET`, webhook Soniox bằng bí mật riêng.
- **Drive:**
  - Phạm vi `drive.file`: ứng dụng chỉ thấy tệp do chính nó tạo.
  - Tệp không chia sẻ công khai. Âm thanh chỉ phát qua route có kiểm tra quyền.
- **Tài khoản:**
  - Người đăng ký đầu tiên là quản trị viên.
  - Tuỳ chọn duyệt tài khoản mới (Quản trị → Đơn vị).
  - Tuỳ chọn giới hạn tên miền email (`ALLOWED_EMAIL_DOMAINS`).
- **Thao tác xoá:** mọi thao tác xoá đều hỏi xác nhận. Xoá bản ghi chuyển tệp Drive vào Thùng rác, không xoá vĩnh viễn.

## 7. Realtime và cộng tác

- Chat nhóm và chat 1-1 dùng Supabase Realtime `postgres_changes` trên bảng `messages`, và vẫn tuân thủ RLS.
- Số tin chưa đọc lấy từ RPC `my_channels()`.
- Transcript lưu kèm **số phiên bản** (optimistic concurrency): hai người sửa cùng lúc thì người sau được báo tải lại, không ghi đè nhau.
- Tiến độ phiên âm cập nhật qua Realtime, kèm thăm dò 5 s làm dự phòng.

## 8. Kiểm thử

| Lớp | Lệnh | Nội dung |
|---|---|---|
| Đơn vị | `npm test` | Ghép đoạn, chồng lấn, độ phủ, khoảng lặng, thống nhất người nói, Soniox → câu, sửa JSON, trích dẫn, DOCX, mã hoá |
| CSDL | `scripts/test-db.sh` | Migration + kiểm thử RLS, RPC và hàm giành quyền trên PostgreSQL 16 |
| Kiểu/lint | `npm run typecheck`, `npm run lint` | TypeScript strict, ESLint (Next + React Compiler rules) |
| E2E cục bộ | `tests/e2e/gateway.mjs` + PostgREST | Giả lập Supabase để chạy giao diện thật bằng Playwright (xem README) |
