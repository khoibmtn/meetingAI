// Kiểm thử pipeline phiên âm trọn vẹn qua API thật của ứng dụng (không cần trình duyệt):
// đăng nhập → bắt đầu phiên âm → chờ worker nền chạy hết các bước → đối chiếu CSDL với đáp án.
// Dùng cùng tests/e2e/run.sh (tự dựng PostgreSQL + PostgREST + gateway + máy chủ giả lập + Next).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3100";
const SUPABASE = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const DB = process.env.DATABASE_URL;
const GT = JSON.parse(fs.readFileSync(process.env.GT, "utf8"));
const TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 240_000);
const REC_GEMINI = "10000000-0000-0000-0000-0000000000e1";
const REC_SONIOX = "10000000-0000-0000-0000-0000000000e2";
const REC_TEMP = "10000000-0000-0000-0000-0000000000e3";
const STORAGE_DIR = process.env.STORAGE_DIR;
const AUDIO = process.env.AUDIO;

const sql = (q) => execFileSync("psql", [DB, "-At", "-c", q], { encoding: "utf8" }).trim();
const failures = [];
function check(cond, msg) {
  console.log(`${cond ? "  ✔" : "  ✘"} ${msg}`);
  if (!cond) failures.push(msg);
}

// Đăng nhập qua GoTrue giả lập rồi dựng cookie phiên như @supabase/ssr
const res = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@e2e.local", password: process.env.E2E_PASSWORD ?? "matkhau123" }),
});
if (!res.ok) throw new Error(`Đăng nhập thất bại: ${res.status}`);
const session = await res.json();
const cookieName = `sb-${new URL(SUPABASE).hostname.split(".")[0]}-auth-token`;
const cookie = `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

async function transcribe(recordingId, body) {
  const r = await fetch(`${APP}/api/recordings/${recordingId}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Không bắt đầu được phiên âm (${r.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text).job.id;
}

async function api(method, path, body, headers = {}) {
  const r = await fetch(`${APP}${path}`, {
    method,
    headers: { Cookie: cookie, ...(body && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Tải tệp lên theo khối như trình duyệt (tuỳ chọn dừng giữa chừng để kiểm tra tiếp tục). */
async function uploadFile(recordingId, bytes, target, stopAfterChunks = Infinity) {
  const meta = { filename: "e2e-khong-luu.m4a", mimeType: "audio/mp4", size: bytes.length, target };
  let { offset, chunkSize, done } = await api("POST", `/api/recordings/${recordingId}/upload`, meta);
  for (let n = 0; !done && n < stopAfterChunks; n++) {
    const end = Math.min(offset + chunkSize, bytes.length);
    ({ offset, done } = await api("PUT", `/api/recordings/${recordingId}/upload?offset=${offset}`, bytes.subarray(offset, end), {
      "Content-Type": "application/octet-stream",
    }));
  }
  return { offset, done, chunkSize };
}

const tempParts = (id) => {
  const dir = `${STORAGE_DIR}/audio-temp/${id}`;
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

async function waitJob(jobId) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < TIMEOUT_MS) {
    const row = sql(`select status || ' | ' || coalesce(stage, '') || ' | ' || coalesce(error, '') from transcription_jobs where id = '${jobId}'`);
    if (row !== last) {
      console.log(`    [${Math.round((Date.now() - t0) / 1000)}s] ${row}`);
      last = row;
    }
    if (/^(done|error)/.test(row)) return row.split(" | ")[0];
    await new Promise((r) => setTimeout(r, 1500));
  }
  return "timeout";
}

const count = (q) => Number(sql(q));
const transcriptOf = (id, expr) => sql(`select ${expr} from transcripts where recording_id = '${id}'`);

// ---------------------------------------------------------------------------
console.log(`\n▶ Gemini: ${GT.segments.length} câu đáp án, đoạn bị bỏ sót và lỗi tạm thời được giả lập`);
const jobG = await transcribe(REC_GEMINI, { connectionId: "30000000-0000-0000-0000-0000000000e1" });
check((await waitJob(jobG)) === "done", "tác vụ hoàn tất");
check(sql(`select status from recordings where id = '${REC_GEMINI}'`) === "ready", "bản ghi chuyển sang 'ready'");
check(count(`select count(*) from transcription_chunks where job_id = '${jobG}'`) >= 3, "chia ≥ 3 đoạn (25 phút, 10 phút/đoạn)");
check(
  count(`select count(*) from transcription_chunks where job_id = '${jobG}' and attempts > 1`) >= 1,
  "đoạn bị lỗi tạm thời được thử lại và thành công",
);
check(
  sql(`select attempts || ':' || (result->>'model') from transcription_chunks where job_id = '${jobG}' and kind = 'main' and idx = 0`) ===
    "3:gemini-2.5-flash",
  "mô hình chính quá tải (503) 2 lần → đoạn 1 chuyển sang mô hình dự phòng",
);
check(
  transcriptOf(REC_GEMINI, "quality::text").includes("mô hình dự phòng gemini-2.5-flash"),
  "transcript ghi chú đoạn dùng mô hình dự phòng",
);
const nG = Number(transcriptOf(REC_GEMINI, "jsonb_array_length(segments)"));
check(nG === GT.segments.length, `đủ câu sau khi quét bổ sung: ${nG}/${GT.segments.length}`);
check(
  count(`select count(*) from transcripts, jsonb_array_elements(segments) s where recording_id = '${REC_GEMINI}' and s->'flags' ? 'gap_fill'`) > 0,
  "có câu được tìm lại ở lượt quét bổ sung (cờ gap_fill)",
);
const coverage = Number(transcriptOf(REC_GEMINI, "(quality->>'coverageRatio')"));
check(coverage >= 0.97, `độ phủ ≥ 97% (${(coverage * 100).toFixed(1)}%)`);
const names = sql(
  `select string_agg(x.key || '=' || x.name, ';' order by x.key) from transcripts t, jsonb_to_recordset(t.speakers) as x(key text, name text) where t.recording_id = '${REC_GEMINI}'`,
);
for (const s of GT.speakers) {
  const expected = s.lowConfidence ? `${s.key}=Người nói ${s.key.slice(1)}` : `${s.key}=${s.name}`;
  check(names.includes(expected), `người nói ${expected}`);
}

// ---------------------------------------------------------------------------
console.log("\n▶ Soniox: gửi tệp gốc, hiệu đính thuật ngữ có kiểm chứng, tự tạo biên bản giao ban");
const jobS = await transcribe(REC_SONIOX, { connectionId: "30000000-0000-0000-0000-0000000000e2", autoReportTemplate: "sys:giao-ban" });
check((await waitJob(jobS)) === "done", "tác vụ hoàn tất");
const nS = Number(transcriptOf(REC_SONIOX, "jsonb_array_length(segments)"));
check(nS === GT.segments.length, `token Soniox gom đúng thành câu: ${nS}/${GT.segments.length}`);
check(transcriptOf(REC_SONIOX, "engine") === "soniox", "engine = soniox");
check(
  count(`select count(*) from transcripts, jsonb_array_elements(segments) s where recording_id = '${REC_SONIOX}' and s->>'text' like '%aPTT%' and s->'flags' ? 'term_corrected'`) === 1,
  "áp dụng sửa thuật ngữ an toàn (APTT → aPTT) và gắn cờ",
);
check(
  count(`select count(*) from transcripts, jsonb_array_elements(segments) s where recording_id = '${REC_SONIOX}' and s->>'text' like '%hoàn toàn khác%'`) === 0,
  "loại đề xuất sửa làm đổi nội dung",
);
check(
  count(`select count(*) from transcripts, jsonb_array_elements(original_segments) s where recording_id = '${REC_SONIOX}' and s->>'text' like '%APTT%'`) === 1,
  "bản máy gốc giữ nguyên văn trước khi AI hiệu đính",
);
let report = "";
for (let i = 0; i < 40 && !/^(ready|error)/.test(report); i++) {
  await new Promise((r) => setTimeout(r, 1500));
  report = sql(`select coalesce(max(status), '') from reports where recording_id = '${REC_SONIOX}' and template_key = 'sys:giao-ban'`);
}
check(report === "ready", "tự tạo biên bản giao ban sau khi phiên âm");

// ---------------------------------------------------------------------------
console.log("\n▶ Kiểm tra kết nối khi Gemini quá tải: báo lỗi tạm thời, không khoá kết nối");
const tested = await api("POST", "/api/ai/connections/test", {
  id: "30000000-0000-0000-0000-0000000000e5",
  provider: "gemini",
  baseUrl: "http://127.0.0.1:4010",
  model: "gemini-9-overloaded",
});
check(!tested.ok && tested.transient === true && /quá tải/.test(tested.error ?? ""), `kết quả: lỗi tạm thời — ${tested.error}`);
check(
  sql(`select status || ':' || (last_error is not null) from ai_connections where id = '30000000-0000-0000-0000-0000000000e5'`) === "ok:true",
  "kết nối vẫn 'ok' (chỉ ghi lại lỗi)",
);

// ---------------------------------------------------------------------------
console.log("\n▶ Không lưu tệp: gửi tệp tạm theo khối, phiên âm, tự xoá tệp tạm; tải lại để phiên âm lại");
const bytes = new Uint8Array(fs.readFileSync(AUDIO));
const partial = await uploadFile(REC_TEMP, bytes, "temp", 1);
const resumed = await api("POST", `/api/recordings/${REC_TEMP}/upload`, {
  filename: "e2e-khong-luu.m4a",
  mimeType: "audio/mp4",
  size: bytes.length,
  target: "temp",
});
check(!partial.done && resumed.offset === partial.offset, `tải lên dở được tiếp tục đúng vị trí (${resumed.offset} byte)`);
const up = await uploadFile(REC_TEMP, bytes, "temp");
const parts = Math.ceil(bytes.length / up.chunkSize);
check(up.done && sql(`select upload_status from recordings where id = '${REC_TEMP}'`) === "temporary", "tệp tạm nhận đủ → 'temporary'");
check(tempParts(REC_TEMP) === parts, `tệp tạm lưu thành ${parts} phần ≤ 4 MiB`);
// Lỗi ở bước chuẩn bị (kết nối AI sai địa chỉ) → tệp tạm phải được giữ để "Thử lại"
const jobT = await transcribe(REC_TEMP, { connectionId: "30000000-0000-0000-0000-0000000000e4" });
check((await waitJob(jobT)) === "error", "kết nối AI hỏng → tác vụ lỗi ở bước chuẩn bị");
check(
  sql(`select upload_status from recordings where id = '${REC_TEMP}'`) === "temporary" && tempParts(REC_TEMP) === parts,
  "tác vụ lỗi: tệp tạm vẫn được giữ",
);
sql(`update ai_connections set base_url = 'http://127.0.0.1:4010' where id = '30000000-0000-0000-0000-0000000000e4'`);
await api("POST", `/api/jobs/${jobT}/resume`, { retryFailed: true });
check((await waitJob(jobT)) === "done", "“Thử lại” đọc lại tệp tạm và phiên âm xong");
const nT = Number(transcriptOf(REC_TEMP, "jsonb_array_length(segments)"));
check(nT === GT.segments.length, `đủ câu: ${nT}/${GT.segments.length}`);
check(sql(`select upload_status || ':' || coalesce(drive_file_id, '') from recordings where id = '${REC_TEMP}'`) === "discarded:", "xong → 'discarded', không có tệp Drive");
check(tempParts(REC_TEMP) === 0, "tệp tạm đã bị xoá khỏi Storage");
check(count(`select count(*) from upload_sessions where recording_id = '${REC_TEMP}'`) === 0, "không còn phiên tải lên");
const again = await transcribe(REC_TEMP, {}).then(
  () => "đã chạy",
  (e) => e.message,
);
check(/Chưa có tệp ghi âm/.test(again), "không có tệp thì không phiên âm lại được");
const audioRes = await fetch(`${APP}/api/recordings/${REC_TEMP}/audio`, { headers: { Cookie: cookie } });
check(audioRes.status === 404, "không có tệp để phát (404)");
await uploadFile(REC_TEMP, bytes, "temp");
const jobT2 = await transcribe(REC_TEMP, { connectionId: "30000000-0000-0000-0000-0000000000e1", gapFill: false });
check((await waitJob(jobT2)) === "done", "tải lại tệp tạm và phiên âm lại");
check(transcriptOf(REC_TEMP, "version") === "2", "transcript được thay bằng lượt mới (version 2)");
check(tempParts(REC_TEMP) === 0 && sql(`select upload_status from recordings where id = '${REC_TEMP}'`) === "discarded", "tệp tạm lại được xoá");

console.log(failures.length ? `\n✘ ${failures.length} kiểm tra thất bại` : "\n✔ Tất cả kiểm tra pipeline đạt");
process.exit(failures.length ? 1 : 0);
