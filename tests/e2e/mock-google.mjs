// Máy chủ giả lập các API bên ngoài cho kiểm thử pipeline cục bộ/CI (KHÔNG dùng production):
//  - Google OAuth token + Drive (tải nội dung tệp gốc, hỗ trợ Range)
//  - Gemini: Files API (upload resumable) + generateContent / streamGenerateContent
//  - Soniox: files, transcriptions, transcript (token có phân vai)
// Trả lời dựa trên "đáp án" (GT) theo đúng khoảng thời gian của từng đoạn — để kiểm tra
// ghép đoạn, quét khoảng bị bỏ sót, đặt tên người nói, hiệu đính thuật ngữ.
//
// Biến môi trường:
//   AUDIO=đường dẫn tệp âm thanh gốc   GT=đường dẫn gt.json   MOCK_PORT=4010   LATENCY_MS=300
//   OMIT="2:60:150"      → đoạn idx 2 bỏ sót các câu có mốc tương đối 60–150 s (mô phỏng lỗi bỏ sót của Gemini)
//   FAIL_ONCE="1:500"    → lần gọi đầu của đoạn idx 1 trả lỗi 500 (kiểm tra thử lại)
//   FAIL_COUNT="1:500:3" → đoạn idx 1 lỗi liên tiếp 3 lần
//   OVERLOAD="gemini-3.8-flash:0:2" → mô hình đó, đoạn idx 0: 2 lần gọi đầu trả 503 "high demand" (kiểm tra mô hình dự phòng)
//   OVERLOAD_MODELS="gemini-9-overloaded" → mọi lời gọi tới các mô hình này trả 503 "high demand"
//   FILE_GONE="1"        → tệp của đoạn idx 1 "mất" ở lần gọi đầu: mọi lời gọi dùng tệp đó trả 403 "không truy cập được File"
//                          cho tới khi đoạn được tải lên lại (tệp mới) — như tệp hết hạn / khoá dự án khác
//   ECHO_REFS="1"        → khi có giọng mẫu gửi kèm, "lỡ" phiên âm cả giọng mẫu thành câu ở cuối (kiểm tra bộ lọc)
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const AUDIO = process.env.AUDIO;
const GT = JSON.parse(fs.readFileSync(process.env.GT, "utf8"));
// Không đặt OMIT thì không bỏ sót đoạn nào ("".split → [0] sẽ bị hiểu nhầm là đoạn 0)
const [omitChunk, omitFrom, omitTo] = process.env.OMIT ? process.env.OMIT.split(":").map(Number) : [-1, 0, 0];
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 300);
const rules = (name) =>
  (process.env[name] ?? "")
    .split(",")
    .filter(Boolean)
    .map((x) => x.split(":").map(Number));
const FAIL_ONCE = rules("FAIL_ONCE");
const FAIL_COUNT = rules("FAIL_COUNT");
const OVERLOAD = (process.env.OVERLOAD ?? "")
  .split(",")
  .filter(Boolean)
  .map((x) => {
    const [model, idx, n] = x.split(":");
    return { model, idx: Number(idx), n: Number(n) };
  });
const OVERLOAD_MODELS = (process.env.OVERLOAD_MODELS ?? "").split(",").filter(Boolean);
const FILE_GONE = (process.env.FILE_GONE ?? "").split(",").filter(Boolean).map(Number);
const ECHO_REFS = process.env.ECHO_REFS === "1";
const filesGone = new Set();
const goneFiles = new Set();
const overloads = new Map();

const files = new Map();
const sessions = new Map();
/** Các request DeepSeek đã nhận (để kiểm tra thứ tự prompt và tham số suy luận). */
const deepseekLog = [];
const failures = new Map();
let seq = 0;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const parseTc = (tc) => tc.split(":").map(Number).reduce((a, v) => a * 60 + v, 0);
const readBody = (req) =>
  new Promise((resolve) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => resolve(Buffer.concat(c)));
  });
const json = (res, status, obj, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(obj));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const speakerInfo = (key) => GT.speakers.find((s) => s.key === key) ?? { key, name: "", role: "" };

/** Các tệp giọng mẫu gửi kèm (mọi fileData sau tệp đầu tiên): khoá người nói + khoảng thời gian gốc. */
function voiceRefsOf(req) {
  const parts = req.contents?.[0]?.parts ?? [];
  return parts
    .filter((p) => p.fileData)
    .slice(1)
    .map((p) => {
      const id = p.fileData.fileUri.split("/").pop();
      const m = /-voice-([A-Z]\d+)-([\d.]+)-([\d.]+)$/.exec(files.get(id)?.displayName ?? "");
      return m ? { key: m[1], start: Number(m[2]), end: Number(m[3]) } : null;
    })
    .filter(Boolean);
}

function transcription(prompt, req) {
  const multi = /từ (\S+) đến (\S+) của cuộc họp/.exec(prompt);
  const lenM = /Độ dài tệp ≈ (\S+?)\./.exec(prompt);
  const absStart = multi ? parseTc(multi[1]) : 0;
  const absEnd = multi ? parseTc(multi[2]) : parseTc(lenM[1]);
  const part = /PHẦN (\d+)\/(\d+)/.exec(prompt);
  const idx = part ? Number(part[1]) - 1 : 0;
  const win = /CHỈ phiên âm phần âm thanh từ (\S+) đến (\S+) của tệp này/.exec(prompt);
  let segs = GT.segments.filter((s) => s.start >= absStart && s.start < absEnd);
  if (win) {
    const w0 = parseTc(win[1]);
    const w1 = parseTc(win[2]);
    segs = segs.filter((s) => s.start - absStart >= w0 - 2 && s.start - absStart <= w1 + 2);
  } else if (idx === omitChunk) {
    segs = segs.filter((s) => s.start - absStart < omitFrom || s.start - absStart > omitTo);
  }
  const keys = [...new Set(segs.map((s) => s.speaker))];
  const refs = voiceRefsOf(req);
  log(
    `Gemini phiên âm đoạn#${idx} [${fmt(absStart)}–${fmt(absEnd)}]${win ? ` cửa sổ ${win[1]}–${win[2]}` : ""} → ${segs.length} câu` +
      (refs.length ? `, ${refs.length} giọng mẫu (${refs.map((r) => r.key).join(", ")})` : ""),
  );
  // Mô hình "lỡ" phiên âm cả giọng mẫu: thêm câu trùng lời giọng mẫu ở cuối, mốc vượt quá độ dài tệp
  const echoes = ECHO_REFS
    ? refs
        .map((r) => GT.segments.find((g) => g.start <= r.start + 1 && g.end >= r.start))
        .filter(Boolean)
        .map((g, i) => ({ start: fmt(absEnd - absStart + 2 + i * 6), end: fmt(absEnd - absStart + 7 + i * 6), speaker: g.speaker, text: g.text }))
    : [];
  return JSON.stringify({
    segments: [
      ...segs.map((s) => ({
        start: fmt(s.start - absStart),
        end: fmt(Math.min(s.end, absEnd) - absStart),
        speaker: s.speaker,
        text: s.text,
      })),
      ...echoes,
    ],
    speakers: keys.map((k) => ({ id: k, name: speakerInfo(k).name, role: speakerInfo(k).role ?? "" })),
  });
}

function answer(req) {
  const sys = JSON.stringify(req.systemInstruction ?? "");
  const all = JSON.stringify(req.contents ?? "");
  if (sys.includes("You identify speakers")) {
    log("Gemini đặt tên người nói");
    return JSON.stringify({
      speakers: GT.speakers.map((s) => ({
        key: s.key,
        name: s.lowConfidence ? "" : s.name,
        role: s.role ?? "",
        confidence: s.lowConfidence ? "low" : "high",
        evidence: "giả lập",
      })),
      merges: [],
    });
  }
  if (sys.includes("You fix transcription errors")) {
    const user = (req.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join("\n");
    const lines = user.split("SEGMENTS (id|text):")[1]?.trim().split("\n") ?? [];
    const edits = [];
    const aptt = lines.find((l) => l.includes("APTT"));
    if (aptt) edits.push({ id: aptt.split("|")[0], find: "APTT", replace: "aPTT" }); // an toàn → phải được áp dụng
    const long = lines.find((l) => (l.split("|")[1] ?? "").length > 40);
    if (long) {
      // viết lại cả câu → phải bị bộ kiểm chứng loại
      edits.push({ id: long.split("|")[0], find: long.split("|")[1].slice(0, 20), replace: "Một câu hoàn toàn khác, dài hơn rất nhiều so với bản gốc, không liên quan gì cả" });
    }
    log(`Gemini hiệu đính thuật ngữ: ${lines.length} câu → đề xuất ${edits.length} sửa`);
    return JSON.stringify({ edits });
  }
  if (all.includes("THÔNG TIN CUỘC HỌP")) {
    const prompt = (req.contents?.[0]?.parts ?? []).map((p) => p.text ?? "").join("\n");
    return transcription(prompt, req);
  }
  log("Gemini soạn văn bản / hỏi đáp");
  return "## Kết luận (giả lập)\n\n- Nội dung kiểm thử [R1 00:08].\n";
}

function injectedFailure(body) {
  const all = JSON.stringify(body.contents ?? "");
  const part = /PHẦN (\d+)\/(\d+)/.exec(all);
  if (!part || all.includes("CHỈ phiên âm phần")) return null;
  const idx = Number(part[1]) - 1;
  const count = FAIL_COUNT.find(([i]) => i === idx);
  const n = failures.get(idx) ?? 0;
  if (count && n < count[2]) {
    failures.set(idx, n + 1);
    return count[1];
  }
  const once = FAIL_ONCE.find(([i]) => i === idx);
  if (once && n === 0) {
    failures.set(idx, 1);
    return once[1];
  }
  return null;
}

function injectedFileGone(body) {
  const all = JSON.stringify(body.contents ?? "");
  // Tệp đã "mất" → mọi lời gọi dùng tệp đó đều 403 cho tới khi đoạn được tải lên lại (id mới)
  for (const id of goneFiles) if (all.includes(`files/${id}"`)) return id; // có dấu " để "f1" không khớp "f12"
  const part = /PHẦN (\d+)\/(\d+)/.exec(all);
  if (!part || all.includes("CHỈ phiên âm phần")) return null;
  const idx = Number(part[1]) - 1;
  if (!FILE_GONE.includes(idx) || filesGone.has(idx)) return null;
  filesGone.add(idx);
  const main = /files\/([\w-]+)/.exec(all)?.[1] ?? "unknown"; // tệp đầu tiên = tệp của đoạn
  goneFiles.add(main);
  return main;
}

function injectedOverload(model, body) {
  if (OVERLOAD_MODELS.includes(model)) return true;
  const all = JSON.stringify(body.contents ?? "");
  const part = /PHẦN (\d+)\/(\d+)/.exec(all);
  if (!part || all.includes("CHỈ phiên âm phần")) return false;
  const idx = Number(part[1]) - 1;
  const rule = OVERLOAD.find((r) => r.model === model && r.idx === idx);
  const key = `${model}:${idx}`;
  const n = overloads.get(key) ?? 0;
  if (!rule || n >= rule.n) return false;
  overloads.set(key, n + 1);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    // ---- Google OAuth + Drive ----
    if (req.method === "POST" && p === "/token") {
      return json(res, 200, { access_token: "mock-token", expires_in: 3600, token_type: "Bearer" });
    }
    if (req.method === "GET" && p.startsWith("/drive/v3/files/") && url.searchParams.get("alt") === "media") {
      if (req.headers.authorization !== "Bearer mock-token") return json(res, 401, { error: "unauthorized" });
      const data = fs.readFileSync(AUDIO);
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      if (!m) {
        res.writeHead(200, { "Content-Length": data.length, "Content-Type": "audio/mp4", "Accept-Ranges": "bytes" });
        return res.end(data);
      }
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
      res.writeHead(206, {
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Content-Type": "audio/mp4",
        "Accept-Ranges": "bytes",
      });
      return res.end(data.subarray(start, end + 1));
    }

    // ---- Gemini Files API (resumable) ----
    if (req.method === "POST" && p.endsWith("/upload/v1beta/files")) {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const id = `f${++seq}`;
      sessions.set(id, { size: 0, displayName: body.file?.displayName, mimeType: req.headers["x-goog-upload-header-content-type"] });
      res.writeHead(200, {
        "x-goog-upload-url": `http://127.0.0.1:${PORT}/upload-session/${id}`,
        "x-goog-upload-status": "active",
        "Content-Type": "application/json",
      });
      return res.end("{}");
    }
    if (req.method === "POST" && p.startsWith("/upload-session/")) {
      const id = p.split("/").pop();
      const s = sessions.get(id);
      s.size += (await readBody(req)).length;
      if (!String(req.headers["x-goog-upload-command"] ?? "").includes("finalize")) {
        res.writeHead(200, { "x-goog-upload-status": "active" });
        return res.end();
      }
      const file = {
        name: `files/${id}`,
        uri: `http://127.0.0.1:${PORT}/v1beta/files/${id}`,
        mimeType: s.mimeType,
        displayName: s.displayName,
        sizeBytes: String(s.size),
        state: "ACTIVE",
      };
      files.set(id, file);
      log(`Gemini nhận tệp ${s.displayName} (${(s.size / 1048576).toFixed(1)} MB)`);
      return json(res, 200, { file }, { "x-goog-upload-status": "final" });
    }
    if (p.startsWith("/v1beta/files/")) {
      const id = p.split("/").pop();
      if (req.method === "DELETE") {
        files.delete(id);
        return json(res, 200, {});
      }
      const f = files.get(id);
      return f ? json(res, 200, f) : json(res, 404, { error: { code: 404, message: "not found", status: "NOT_FOUND" } });
    }
    if (req.method === "GET" && p === "/v1beta/models") {
      return json(res, 200, {
        models: [
          { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
        ],
      });
    }
    const gm = /^\/v1beta\/models\/([^:]+):(generateContent|streamGenerateContent)$/.exec(p);
    if (req.method === "POST" && gm) {
      const body = JSON.parse((await readBody(req)).toString());
      await sleep(LATENCY_MS);
      if (injectedOverload(gm[1], body)) {
        log(`QUÁ TẢI 503 (${gm[1]})`);
        return json(res, 503, {
          error: { code: 503, message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.", status: "UNAVAILABLE" },
        });
      }
      const gone = injectedFileGone(body);
      if (gone) {
        log(`TỆP KHÔNG CÒN 403 (${gone})`);
        return json(res, 403, {
          error: { code: 403, message: `You do not have permission to access the File ${gone} or it may not exist.`, status: "PERMISSION_DENIED" },
        });
      }
      const code = injectedFailure(body);
      if (code) {
        log(`TIÊM LỖI ${code}`);
        return json(res, code, { error: { code, message: code === 429 ? "Resource has been exhausted" : "Internal error encountered.", status: code === 429 ? "RESOURCE_EXHAUSTED" : "INTERNAL" } });
      }
      const text = answer(body);
      const usage = { promptTokenCount: 1000, candidatesTokenCount: Math.ceil(text.length / 3), totalTokenCount: 1000 + Math.ceil(text.length / 3) };
      if (gm[2] === "generateContent") {
        return json(res, 200, { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }], usageMetadata: usage });
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const pieces = 4;
      const size = Math.ceil(text.length / pieces);
      for (let i = 0; i < pieces; i++) {
        const last = i === pieces - 1;
        const ev = {
          candidates: [{ content: { role: "model", parts: [{ text: text.slice(i * size, (i + 1) * size) }] }, index: 0, ...(last ? { finishReason: "STOP" } : {}) }],
          ...(last ? { usageMetadata: usage } : {}),
        };
        res.write(`data: ${JSON.stringify(ev)}\r\n\r\n`);
        await sleep(20);
      }
      return res.end();
    }

    // ---- DeepSeek (Chat Completions tương thích OpenAI) ----
    // Mô phỏng prompt cache của DeepSeek: phần đầu request (theo từng message) giống hệt request trước → "trúng cache"
    if (req.method === "POST" && p === "/deepseek/chat/completions") {
      if (req.headers.authorization !== "Bearer mock-deepseek-key") return json(res, 401, { error: { message: "Authentication Fails" } });
      const body = JSON.parse((await readBody(req)).toString());
      const prev = deepseekLog.at(-1);
      let hit = 0;
      for (let i = 0; prev && i < Math.min(prev.messages.length, body.messages.length); i++) {
        if (JSON.stringify(prev.messages[i]) !== JSON.stringify(body.messages[i])) break;
        hit += Math.ceil(JSON.stringify(body.messages[i]).length / 4);
      }
      // Request sau có chứa trọn các message của request trước (kể cả câu trả lời) không?
      const extendsPrev = !!prev && prev.messages.every((m, i) => JSON.stringify(m) === JSON.stringify(body.messages[i]));
      deepseekLog.push({ ...body, extendsPrev });
      log(`DeepSeek ${body.stream ? "stream" : "json"}: thinking=${body.thinking?.type ?? "-"}, ${body.messages.length} message, trúng cache ${hit} token`);
      const prompt = Math.ceil(JSON.stringify(body.messages).length / 4);
      const text = "Trả lời giả lập từ DeepSeek [R1 00:05].";
      const usage = {
        prompt_tokens: prompt,
        completion_tokens: 12,
        total_tokens: prompt + 12,
        prompt_cache_hit_tokens: hit,
        prompt_cache_miss_tokens: prompt - hit,
        completion_tokens_details: { reasoning_tokens: body.thinking?.type === "disabled" ? 0 : 900 },
      };
      const base = { id: `ds-${deepseekLog.length}`, created: Math.floor(Date.now() / 1000), model: body.model };
      if (!body.stream) {
        return json(res, 200, { ...base, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage });
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const piece of [text.slice(0, 10), text.slice(10)]) {
        res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      if (body.stream_options?.include_usage) {
        res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [], usage })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    if (req.method === "GET" && p === "/deepseek/_log") {
      return json(
        res,
        200,
        deepseekLog.map((b) => ({
          thinking: b.thinking ?? null,
          reasoningEffort: b.reasoning_effort ?? null,
          includeUsage: b.stream_options?.include_usage ?? false,
          roles: b.messages.map((m) => m.role),
          extendsPrev: b.extendsPrev,
        })),
      );
    }

    // ---- Soniox ----
    if (p.startsWith("/v1/")) {
      if (req.headers.authorization !== "Bearer mock-soniox-key") return json(res, 401, { error: "invalid key" });
      if (req.method === "POST" && p === "/v1/files") {
        const body = await readBody(req);
        log(`Soniox nhận tệp ${(body.length / 1048576).toFixed(1)} MB`);
        return json(res, 201, { id: `sf${++seq}` });
      }
      if (req.method === "GET" && p === "/v1/files") return json(res, 200, { files: [] });
      if (req.method === "GET" && p === "/v1/models") return json(res, 200, { models: [{ id: "stt-async-v5" }] });
      if (req.method === "POST" && p === "/v1/transcriptions") {
        const body = JSON.parse((await readBody(req)).toString());
        const id = `st${++seq}`;
        sessions.set(id, { created: Date.now(), body });
        log(`Soniox tạo phiên âm: diarization=${body.enable_speaker_diarization}, terms=${body.context?.terms?.length ?? 0}`);
        return json(res, 201, { id, status: "queued" });
      }
      const tm = /^\/v1\/transcriptions\/([^/]+)(\/transcript)?$/.exec(p);
      if (tm && req.method === "GET") {
        const s = sessions.get(tm[1]);
        const done = Date.now() - s.created > 2000;
        if (!tm[2]) return json(res, 200, { id: tm[1], status: done ? "completed" : "processing" });
        const tokens = [];
        for (const seg of GT.segments) {
          const words = seg.text.split(/\s+/).filter(Boolean);
          const step = ((seg.end - seg.start) * 1000) / Math.max(1, words.length);
          words.forEach((w, i) =>
            tokens.push({
              text: (tokens.length ? " " : "") + w,
              start_ms: Math.round(seg.start * 1000 + i * step),
              end_ms: Math.round(seg.start * 1000 + (i + 1) * step),
              speaker: String(Number(seg.speaker.slice(1))),
              language: "vi",
              confidence: 0.95,
            }),
          );
        }
        log(`Soniox trả ${tokens.length} token`);
        return json(res, 200, { id: tm[1], text: "", tokens });
      }
      if (req.method === "DELETE") return json(res, 204, {});
    }

    log("KHÔNG XỬ LÝ", req.method, p);
    json(res, 404, { error: { code: 404, message: `mock: ${req.method} ${p}`, status: "NOT_FOUND" } });
  } catch (e) {
    log("LỖI", e);
    json(res, 500, { error: { code: 500, message: String(e), status: "INTERNAL" } });
  }
});
server.listen(PORT, "127.0.0.1", () => log(`mock http://127.0.0.1:${PORT}`));
