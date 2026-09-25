// Sinh dữ liệu TỔNG HỢP cho kiểm thử pipeline (không dùng bản ghi thật):
//   audio.m4a — 25 phút, cứ 8 s có 6 s "tiếng nói" (âm điều biến) + 2 s lặng, trên nền ồn nhẹ
//   gt.json   — đáp án: 187 câu khớp đúng các quãng có tiếng, 4 người nói
//   seed.sql  — người dùng, 3 bản ghi (Gemini/Soniox trên Drive, một bản chưa có tệp — phiên âm không lưu tệp),
//               kết nối AI giả lập (khoá mã hoá bằng APP_ENCRYPTION_KEY)
// Chạy: APP_ENCRYPTION_KEY=... node tests/e2e/synthetic.mjs [thư-mục-ra]
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const OUT = path.resolve(process.argv[2] ?? "tests/e2e/.out");
const DURATION = 1500;
const PERIOD = 8;
const SPEECH = [0.5, 6.5]; // trong mỗi chu kỳ 8 s
fs.mkdirSync(OUT, { recursive: true });

// 1) Âm thanh
const audio = path.join(OUT, "audio.m4a");
const expr =
  `if(between(mod(t\\,${PERIOD})\\,${SPEECH[0]}\\,${SPEECH[1]})\\,0.18*sin(2*PI*(190+60*sin(2*PI*2.5*t))*t)\\,0)` +
  `+0.004*(random(0)-0.5)`;
execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc=${expr}:s=16000:d=${DURATION}`, "-c:a", "aac", "-b:a", "32k", audio]);

// 2) Đáp án: câu tiếng Việt tổng hợp, mỗi câu một tổ hợp khác nhau (tránh bị coi là trùng lặp)
const A = ["Bệnh nhân nam", "Bệnh nhân nữ", "Người bệnh cao tuổi", "Ca mổ phiên", "Ca cấp cứu", "Bệnh nhi", "Sản phụ", "Người bệnh sau mổ", "Ca gây mê tuỷ sống", "Bệnh nhân ngoại trú", "Ca nội soi", "Người bệnh hồi sức"];
const B = ["huyết áp ổn định", "mạch nhanh nhẹ", "SpO2 duy trì tốt", "đau sau mổ giảm rõ", "tỉnh táo hợp tác", "nhiệt độ bình thường", "nước tiểu đủ", "không buồn nôn", "vận động sớm được", "ăn uống qua miệng", "rút ống an toàn", "không chảy máu", "dẫn lưu ít dịch"];
const C = ["cần theo dõi thêm", "đề nghị hội chẩn", "tiếp tục phác đồ", "giảm liều giảm đau", "bổ sung xét nghiệm", "chuyển khoa phòng", "ra viện theo hẹn", "đánh giá lại ngày mai", "ghi nhận vào bệnh án", "báo cáo chủ tọa", "rút kinh nghiệm chung"];
const speakers = [
  { key: "S1", name: "BS. Nguyễn An", role: "Chủ tọa" },
  { key: "S2", name: "BS. Trần Bình", role: "Trình bày ca bệnh" },
  { key: "S3", name: "ĐD. Lê Chi", role: "Điều dưỡng trưởng" },
  { key: "S4", name: "", role: "", lowConfidence: true }, // AI không chắc → giữ tên mặc định
];
const turns = ["S1", "S2", "S2", "S3", "S1", "S4", "S2"];
const segments = [];
for (let k = 0; PERIOD * k + SPEECH[1] <= DURATION; k++) {
  const text =
    k === 40
      ? "Xét nghiệm đông máu: PT 11 giây, APTT 29,8 giây, fibrinogen 3,45 g/L trong giới hạn."
      : `${A[k % A.length]} giường ${(k % 40) + 1}, ${B[(k * 5 + 3) % B.length]}, ${C[(k * 7 + 1) % C.length]}, chỉ số ${k * 3 + 7}.`;
  segments.push({
    id: `g${String(k + 1).padStart(4, "0")}`,
    start: PERIOD * k + SPEECH[0],
    end: PERIOD * k + SPEECH[1],
    speaker: turns[Math.floor(k / 4) % turns.length],
    text,
  });
}
fs.writeFileSync(path.join(OUT, "gt.json"), JSON.stringify({ segments, speakers }, null, 1));

// 3) Seed SQL
const keyB64 = process.env.APP_ENCRYPTION_KEY;
if (!keyB64) throw new Error("Cần APP_ENCRYPTION_KEY để mã hoá khoá API giả lập");
const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
};
const size = fs.statSync(audio).size;
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:4010";
const participants = speakers.filter((s) => s.name).map((s) => `${s.name} (${s.role})`).join(", ");
const recording = (id, title) =>
  `('${id}', '00000000-0000-0000-0000-0000000000e0', '${title}', 'giao_ban', '2026-09-25', 'Phòng giao ban', '${participants}', 'e2e-audio', 'uploaded', 'draft', ${size}, 'audio/mp4', 'e2e.m4a')`;
const sql = `
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000e0', 'admin@e2e.local', '{"full_name":"Quản trị E2E"}');

insert into public.recordings (id, owner_id, title, category, meeting_date, location, participants, drive_file_id, upload_status, status, size_bytes, mime_type, original_filename)
values ${recording("10000000-0000-0000-0000-0000000000e1", "E2E Gemini")},
       ${recording("10000000-0000-0000-0000-0000000000e2", "E2E Soniox")};

-- Chưa có tệp (Drive chưa kết nối): phiên âm bằng tệp tạm rồi không lưu
insert into public.recordings (id, owner_id, title, category, meeting_date, participants)
values ('10000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e0', 'E2E Không lưu tệp', 'giao_ban', '2026-09-25', '${participants}');

insert into public.ai_connections (id, scope, name, provider, base_url, encrypted_key, key_hint, model, params, status, created_by)
values ('30000000-0000-0000-0000-0000000000e1', 'org', 'Gemini giả lập', 'gemini', '${MOCK}', '${encrypt("mock-gemini-key")}', '…-key', 'gemini-3.8-flash', '{}', 'ok', '00000000-0000-0000-0000-0000000000e0'),
       ('30000000-0000-0000-0000-0000000000e2', 'org', 'Soniox giả lập', 'soniox', '${MOCK}', '${encrypt("mock-soniox-key")}', '…-key', 'stt-async-v5', '{}', 'ok', '00000000-0000-0000-0000-0000000000e0'),
       -- Địa chỉ sai: bước chuẩn bị thất bại (kiểm tra tệp tạm được giữ để "Thử lại")
       ('30000000-0000-0000-0000-0000000000e4', 'org', 'Gemini hỏng', 'gemini', 'http://127.0.0.1:9', '${encrypt("mock-gemini-key")}', '…-key', 'gemini-3.8-flash', '{}', 'ok', '00000000-0000-0000-0000-0000000000e0');

insert into public.ai_assignments (scope, usage, connection_id)
select 'org', u, '30000000-0000-0000-0000-0000000000e1'
  from unnest(array['transcription', 'speaker_naming', 'term_correction', 'report', 'chat']) u;
`;
fs.writeFileSync(path.join(OUT, "seed.sql"), sql);
console.log(`Đã tạo ${audio} (${(size / 1048576).toFixed(1)} MB), ${segments.length} câu đáp án, seed.sql`);
