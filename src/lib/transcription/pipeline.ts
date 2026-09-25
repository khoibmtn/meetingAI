import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  jobOptions,
  loadJob,
  resolveBaseUrl,
  STALE_SECONDS,
  triggerWorker,
  type JobOptions,
  type WorkerPayload,
} from "./jobs";
import type { Json, Tables } from "@/lib/database.types";
import { driveMediaUrl, fetchDriveMedia, getAccessToken } from "@/lib/drive/google";
import { TEMP_AUDIO_MAX_BYTES } from "@/lib/audio/limits";
import { discardTempAudio, downloadTempAudio } from "@/lib/storage/temp-audio";
import {
  analyzeAudio,
  encodeChunk,
  normalizationGainDb,
  toNormalizeMode,
  type AudioSource,
  type EncodeOptions,
} from "@/lib/audio/ffmpeg";
import { generateJson, type ConnectionConfig } from "@/lib/ai";
import { getConnectionConfig, markAuthFailure, requireConnection, resolveConnection } from "@/lib/ai/connections";
import { AiError, fallbackModelFor, GEMINI_OVERLOADED, GEMINI_RATE_LIMITED, isCapacityError } from "@/lib/ai/types";
import {
  chunkModel,
  FALLBACK_STICKY_MS,
  isTransientError,
  maxAttemptsFor,
  MAX_RETRY_WAIT_MS,
  retryDelayMs,
  servedModelLabel,
} from "./retry";
import { serverEnv } from "@/lib/env";
import { sleep, stripDiacritics } from "@/lib/utils";
import { planChunks } from "./chunking";
import { speechIntervals, totalLength } from "./silence";
import {
  buildChunkPrompt,
  buildGapPrompt,
  buildSpeakerNamingInput,
  CATEGORY_LABELS,
  SPEAKER_NAMING_SCHEMA,
  SPEAKER_NAMING_SYSTEM,
  type MeetingContext,
  type SpeakerNamingResult,
} from "./prompts";
import {
  assignIds,
  computeCoverage,
  mergeChunkOutputs,
  mergeGapSegments,
  talkTimeBySpeaker,
  toAbsoluteSegments,
} from "./merge";
import { defaultSpeakerName, normalizeSpeakerId, reconcileSpeakers, singleLabel, type ChunkRoster } from "./speakers";
import {
  createGemini,
  deleteGeminiFile,
  transcribeWithGemini,
  uploadToGemini,
  type GeminiFileRef,
  type VoiceRefPart,
} from "./gemini-engine";
import {
  dropVoiceRefEchoes,
  MAX_VOICE_REFS,
  MIN_TALK_SEC_FOR_REF,
  pickVoiceRefSegments,
  voiceRefLabel,
  type VoiceRef,
} from "./voice-refs";
import {
  sonioxCleanup,
  sonioxCreateTranscription,
  sonioxGetStatus,
  sonioxGetTokens,
  sonioxUploadFile,
  type SonioxContext,
} from "./soniox";
import { tokensToSegments } from "./soniox-format";
import { loadGlossaryForRecording } from "./glossary";
import { correctTerms } from "./correction";
import { parseTimecode } from "./timecode";
import type { ChunkPlan, Interval, RawChunkResult, Segment, Speaker, TranscriptQuality } from "./types";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

interface JobAnalysis {
  durationSec?: number;
  meanVolumeDb?: number | null;
  silenceThresholdDb?: number;
  noiseFloorDb?: number | null;
  speechLevelDb?: number | null;
  /** Mức khuếch đại tuyến tính đã áp dụng khi mã hoá (chế độ "gain"). */
  gainDb?: number | null;
  speech?: Interval[];
  plans?: ChunkPlan[];
  roster?: Speaker[];
  soniox?: { fileId: string; transcriptionId: string };
  warnings?: string[];
  /** Lúc một đoạn phải chuyển sang mô hình dự phòng — các đoạn sau dùng luôn dự phòng. */
  fallbackSince?: string;
  /** Giọng mẫu đã cắt (khoá toàn cục) — gửi kèm các đoạn sau khi phân vai bằng giọng mẫu. */
  voiceRefs?: VoiceRef[];
  /** Đã xét lấy giọng mẫu từ các đoạn 0..n. */
  voiceRefsBuiltThrough?: number;
}

type Job = Tables<"transcription_jobs">;
type Recording = Tables<"recordings">;
type Admin = ReturnType<typeof createAdminClient>;

const CHUNK_CONCURRENCY = 3;
/** Giãn cách thử lại cơ sở (kiểm thử có thể rút ngắn qua TRANSCRIBE_RETRY_BASE_MS). */
const RETRY_BASE_MS = Number(process.env.TRANSCRIBE_RETRY_BASE_MS) || 10_000;
/** Ngân sách thời gian an toàn cho một lần gọi worker (maxDuration = 300 s). */
const STEP_BUDGET_MS = 250_000;

// ---------------------------------------------------------------------------
// Tiện ích DB
// ---------------------------------------------------------------------------

function jobAnalysis(job: Job): JobAnalysis {
  return (job.analysis as unknown as JobAnalysis) ?? {};
}

async function patchJob(admin: Admin, jobId: string, patch: Partial<Job>) {
  const { error } = await admin
    .from("transcription_jobs")
    .update(patch as never)
    .eq("id", jobId);
  if (error) console.error("patchJob", error.message);
}

async function patchAnalysis(admin: Admin, jobId: string, extra: Partial<JobAnalysis>) {
  const { data } = await admin.from("transcription_jobs").select("analysis").eq("id", jobId).single();
  const merged = { ...((data?.analysis as unknown as JobAnalysis) ?? {}), ...extra };
  await patchJob(admin, jobId, { analysis: merged as unknown as Json });
}

async function failJob(admin: Admin, job: Job, message: string) {
  console.error(`[job ${job.id}] ${message}`);
  await patchJob(admin, job.id, { status: "error", error: message, stage: "Lỗi", finished_at: new Date().toISOString() });
  await admin.from("recordings").update({ status: "error", status_message: message }).eq("id", job.recording_id);
}

function meetingContext(recording: Recording, glossary: MeetingContext["glossary"]): MeetingContext {
  return {
    title: recording.title,
    category: recording.category,
    meetingDate: recording.meeting_date,
    location: recording.location,
    participants: recording.participants,
    description: recording.description,
    glossary,
    language: recording.language,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "mtg-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadOriginal(fileId: string, dest: string) {
  const res = await fetchDriveMedia(fileId);
  if (!res.body) throw new Error("Không đọc được tệp từ Google Drive");
  await streamPipeline(
    Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
    createWriteStream(dest),
  );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Kết nối phiên âm của job (đã giải mã khoá). */
async function transcriptionConn(job: Job): Promise<ConnectionConfig> {
  const opts = jobOptions(job);
  if (opts.connectionId) return getConnectionConfig(opts.connectionId, job.created_by);
  return requireConnection("transcription", job.created_by);
}

function encodeOptions(opts: JobOptions, meanVolumeDb: number | null): EncodeOptions {
  return {
    normalize: toNormalizeMode(opts.normalize),
    gainDb: normalizationGainDb(meanVolumeDb),
    denoise: Boolean(opts.denoise),
  };
}

/** Tệp gốc tối đa bao nhiêu thì chép vào /tmp (Vercel cho 500 MB); lớn hơn thì ffmpeg đọc thẳng từ Drive. */
const LOCAL_ORIGINAL_MAX_BYTES = TEMP_AUDIO_MAX_BYTES;

/** Định dạng gửi thẳng tệp gốc cho Soniox (không mã hoá lại). */
const SONIOX_PASSTHROUGH = /^(audio\/(mp4|x-m4a|m4a|aac|mpeg|mp3|wav|x-wav|wave|flac|x-flac|ogg|webm|opus)|video\/(mp4|webm))$/;

interface OpenedSource {
  src: AudioSource;
  /** Đường dẫn tệp gốc đã tải về (null nếu đọc trực tiếp từ Drive). */
  localPath: string | null;
}

/**
 * Mở tệp gốc cho ffmpeg. Tệp nhỏ: tải về /tmp (đọc nhiều lượt nhanh, ổn định).
 * Tệp lớn (vd. WAV 1–2 GB): ffmpeg đọc trực tiếp từ Drive qua HTTPS + Range, không chiếm /tmp.
 */
async function openOriginal(dir: string, fileId: string, sizeBytes: number): Promise<OpenedSource> {
  if (sizeBytes > 0 && sizeBytes <= LOCAL_ORIGINAL_MAX_BYTES) {
    const localPath = path.join(dir, "original");
    await downloadOriginal(fileId, localPath);
    return { src: { input: localPath }, localPath };
  }
  const token = await getAccessToken();
  return {
    src: {
      input: driveMediaUrl(fileId),
      inputArgs: [
        "-headers",
        `Authorization: Bearer ${token}\r\n`,
        "-reconnect",
        "1",
        "-reconnect_on_network_error",
        "1",
        "-reconnect_delay_max",
        "10",
      ],
    },
    localPath: null,
  };
}

/** Tệp giữ tạm (không lưu lên Drive): ghép các phần từ Storage vào /tmp. */
async function openTempOriginal(dir: string, recordingId: string, sizeBytes: number): Promise<OpenedSource> {
  const localPath = path.join(dir, "original");
  await downloadTempAudio(recordingId, localPath, sizeBytes);
  return { src: { input: localPath }, localPath };
}

/**
 * Tệp đoạn trên Gemini không còn (Files API chỉ giữ 48 giờ; hoặc khoá API đã đổi sang dự án khác):
 * mã hoá lại đúng đoạn đó từ tệp gốc, tải lên lại và cập nhật tham chiếu của đoạn.
 */
async function refreshChunkFile(
  admin: Admin,
  job: Job,
  recording: Recording,
  chunk: Tables<"transcription_chunks">,
  conn: ConnectionConfig,
): Promise<GeminiFileRef> {
  await patchJob(admin, job.id, { stage: `Tệp âm thanh đoạn ${chunk.idx + 1} trên Gemini không còn — đang tải lại từ tệp gốc` });
  return withTempDir(async (dir) => {
    const onDrive = Boolean(recording.drive_file_id) && recording.upload_status === "uploaded";
    const sizeBytes = Number(recording.size_bytes ?? 0);
    const { src } = onDrive
      ? await openOriginal(dir, recording.drive_file_id!, sizeBytes)
      : await openTempOriginal(dir, recording.id, sizeBytes);
    const out = path.join(dir, `chunk-${chunk.idx}.flac`);
    await encodeChunk(src, Number(chunk.start_sec), Number(chunk.end_sec), out, encodeOptions(jobOptions(job), jobAnalysis(job).meanVolumeDb ?? null));
    const ref = await uploadToGemini(createGemini(conn), out, "audio/flac", `rec-${recording.id}-chunk-${chunk.idx}`);
    await admin
      .from("transcription_chunks")
      .update({ file_uri: ref.uri, file_name: ref.name, mime_type: ref.mimeType })
      .eq("job_id", job.id)
      .eq("kind", chunk.kind)
      .eq("idx", chunk.idx);
    return ref;
  });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export async function runWorkerStep(payload: WorkerPayload): Promise<void> {
  const admin = createAdminClient();
  const loaded = await loadJob(admin, payload.jobId);
  if (!loaded) return;
  const { job } = loaded;
  if (["done", "error", "canceled"].includes(job.status) && payload.step !== "autoreport") return;
  try {
    switch (payload.step) {
      case "prepare":
        return await stepPrepare(admin, payload.jobId);
      case "chunk":
        return await stepChunk(admin, payload.jobId, payload.idx);
      case "soniox_poll":
        return await stepSonioxPoll(admin, payload.jobId);
      case "finalize":
        return await stepFinalize(admin, payload.jobId);
      case "autoreport":
        return await stepAutoReport(admin, payload.jobId);
    }
  } catch (err) {
    const fresh = await loadJob(admin, payload.jobId);
    if (fresh && payload.step !== "autoreport") {
      await failJob(admin, fresh.job, err instanceof Error ? err.message : String(err));
    } else {
      console.error(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Bước 1: chuẩn bị âm thanh
// ---------------------------------------------------------------------------

async function stepPrepare(admin: Admin, jobId: string) {
  const claimed = await admin.rpc("claim_job", {
    p_job: jobId,
    p_from: ["queued"],
    p_to: "preparing",
    p_stale_seconds: STALE_SECONDS,
  });
  if (!claimed.data) return;
  const loaded = await loadJob(admin, jobId);
  if (!loaded) return;
  const { job, recording } = loaded;
  const opts = jobOptions(job);
  const startedAt = Date.now();

  await admin.from("recordings").update({ status: "processing" }).eq("id", recording.id);
  const onDrive = Boolean(recording.drive_file_id) && recording.upload_status === "uploaded";
  await patchJob(admin, jobId, {
    stage: onDrive ? "Đang tải tệp gốc từ Google Drive" : "Đang đọc tệp tạm (không lưu sau khi phiên âm)",
    progress: 2,
    error: null,
  });

  await withTempDir(async (dir) => {
    const sizeBytes = Number(recording.size_bytes ?? 0);
    const { src, localPath } = onDrive
      ? await openOriginal(dir, recording.drive_file_id!, sizeBytes)
      : await openTempOriginal(dir, recording.id, sizeBytes);

    await patchJob(admin, jobId, { stage: "Đang phân tích âm lượng, khoảng lặng và tiếng nói", progress: 5 });
    const analysis = await analyzeAudio(src, dir);
    if (!(analysis.durationSec > 1)) throw new Error("Tệp không có dữ liệu âm thanh hợp lệ");
    const silences = analysis.silences;
    const speech = speechIntervals(silences, analysis.durationSec).map((i) => ({
      start: Math.round(i.start * 100) / 100,
      end: Math.round(i.end * 100) / 100,
    }));
    const encOpts = encodeOptions(opts, analysis.meanVolumeDb);
    await patchAnalysis(admin, jobId, {
      durationSec: analysis.durationSec,
      meanVolumeDb: analysis.meanVolumeDb,
      silenceThresholdDb: analysis.silenceThresholdDb,
      noiseFloorDb: analysis.noiseFloorDb,
      speechLevelDb: analysis.speechLevelDb,
      gainDb: encOpts.normalize === "gain" ? encOpts.gainDb : null,
      speech,
    });
    if (!recording.duration_sec) {
      await admin.from("recordings").update({ duration_sec: analysis.durationSec }).eq("id", recording.id);
    }

    if (opts.engine === "soniox") {
      const conn = await transcriptionConn(job);
      // Soniox tự xử lý âm lượng và phân vai trên toàn tệp: gửi nguyên tệp gốc nếu định dạng phổ biến;
      // còn lại (hoặc tệp quá lớn) thì mã hoá FLAC 16 kHz không mất dữ liệu.
      let uploadPath = localPath;
      let uploadMime = recording.mime_type ?? "";
      if (!uploadPath || !SONIOX_PASSTHROUGH.test(uploadMime)) {
        uploadPath = path.join(dir, "full.flac");
        uploadMime = "audio/flac";
        await patchJob(admin, jobId, { stage: "Đang mã hoá âm thanh để gửi Soniox", progress: 8 });
        await encodeChunk(src, 0, null, uploadPath, encOpts);
        if (localPath) await rm(localPath, { force: true });
      }
      await patchJob(admin, jobId, { stage: "Đang tải âm thanh lên Soniox", progress: 10 });
      const fileId = await sonioxUploadFile(conn, uploadPath, uploadMime);
      const glossary = await loadGlossaryForRecording(recording.id, [job.created_by ?? "", recording.owner_id]);
      const base = job.base_url ?? resolveBaseUrl();
      const transcriptionId = await sonioxCreateTranscription(conn, {
        fileId,
        context: buildSonioxContext(meetingContext(recording, glossary)),
        webhookUrl: base.startsWith("https://") ? `${base}/api/webhooks/soniox?job=${jobId}` : undefined,
        webhookSecret: serverEnv.workerSecret(),
        reference: jobId,
      });
      await patchAnalysis(admin, jobId, { soniox: { fileId, transcriptionId } });
      await patchJob(admin, jobId, {
        status: "transcribing",
        total_chunks: 1,
        done_chunks: 0,
        progress: 15,
        stage: "Soniox đang phiên âm và phân vai người nói…",
      });
      // Chờ ngay trong lần gọi này (Soniox thường xử lý nhanh); nếu chưa xong thì webhook/bước sau tiếp tục
      await pollSonioxUntil(admin, jobId, startedAt + STEP_BUDGET_MS);
      return;
    }

    // Engine Gemini: chia đoạn tại khoảng lặng, mã hoá FLAC, tải lên Files API
    const conn = await transcriptionConn(job);
    const ai = createGemini(conn);
    const plans = planChunks(analysis.durationSec, silences, { targetSec: (opts.chunkMinutes ?? 10) * 60 });
    await patchJob(admin, jobId, {
      stage: `Đang chia thành ${plans.length} đoạn và tải lên Gemini`,
      progress: 8,
    });
    const refs = await mapLimit(plans, 3, async (plan) => {
      const out = path.join(dir, `chunk-${plan.idx}.flac`);
      await encodeChunk(src, plan.start, plan.end, out, encOpts);
      try {
        return await uploadToGemini(ai, out, "audio/flac", `rec-${recording.id}-chunk-${plan.idx}`);
      } finally {
        await rm(out, { force: true }); // giải phóng /tmp ngay sau khi tải lên
      }
    });
    const rows = plans.map((plan, i) => ({
      job_id: jobId,
      idx: plan.idx,
      kind: "main",
      start_sec: plan.start,
      end_sec: plan.end,
      file_uri: refs[i].uri,
      file_name: refs[i].name,
      mime_type: refs[i].mimeType,
      status: "pending",
    }));
    await admin.from("transcription_chunks").delete().eq("job_id", jobId);
    const { error } = await admin.from("transcription_chunks").insert(rows);
    if (error) throw new Error(`Không lưu được danh sách đoạn: ${error.message}`);
    await patchAnalysis(admin, jobId, { plans });
    await patchJob(admin, jobId, {
      status: "transcribing",
      total_chunks: plans.length,
      done_chunks: 0,
      progress: 10,
      stage: plans.length > 1 ? `Đang phiên âm đoạn 1/${plans.length}` : "Đang phiên âm",
    });
  });

  const fresh = await loadJob(admin, jobId);
  if (fresh && fresh.job.status === "transcribing" && jobOptions(fresh.job).engine === "gemini") {
    await triggerWorker(fresh.job.base_url ?? resolveBaseUrl(), { jobId, step: "chunk", idx: 0 });
  }
}

function buildSonioxContext(ctx: MeetingContext): SonioxContext {
  const general = [
    { key: "domain", value: "Healthcare / Y khoa (bệnh viện Việt Nam)" },
    { key: "meeting_type", value: CATEGORY_LABELS[ctx.category] ?? ctx.category },
    { key: "topic", value: ctx.title },
  ];
  if (ctx.meetingDate) general.push({ key: "date", value: ctx.meetingDate });
  if (ctx.location) general.push({ key: "location", value: ctx.location });
  const participants = (ctx.participants ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const terms = [...new Set([...participants, ...ctx.glossary.map((g) => g.term)])].slice(0, 400);
  const text = [ctx.description, ctx.participants ? `Thành phần: ${ctx.participants}` : null]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  return { general, terms, ...(text ? { text } : {}) };
}

// ---------------------------------------------------------------------------
// Bước 2a: phiên âm từng đoạn (Gemini)
// ---------------------------------------------------------------------------

async function stepChunk(admin: Admin, jobId: string, idx?: number) {
  const loaded = await loadJob(admin, jobId);
  if (!loaded || loaded.job.status !== "transcribing") return;
  const { job, recording } = loaded;
  const opts = jobOptions(job);
  if (opts.engine !== "gemini") return;

  const { data: chunks } = await admin
    .from("transcription_chunks")
    .select("*")
    .eq("job_id", jobId)
    .eq("kind", "main")
    .order("idx");
  if (!chunks || chunks.length === 0) return;

  // Được gọi riêng cho một đoạn đang chờ thử lại: đợi tới hạn (giãn cách do lỗi tạm thời) rồi mới nhận.
  // Chờ lâu hơn ngân sách một lần gọi hàm thì ngủ một quãng rồi tự gọi lại worker cho đoạn đó.
  if (idx !== undefined) {
    const target = chunks.find((c) => c.idx === idx);
    const waitMs = target?.status === "pending" && target.next_attempt_at ? Date.parse(target.next_attempt_at) - Date.now() : 0;
    if (waitMs > MAX_RETRY_WAIT_MS) {
      await sleep(MAX_RETRY_WAIT_MS);
      await triggerWorker(job.base_url ?? resolveBaseUrl(), { jobId, step: "chunk", idx });
      return;
    }
    if (waitMs > 0) await sleep(waitMs + 250);
  }

  const firstDone = chunks[0].status === "done";
  // Phân vai bằng giọng mẫu: các đoạn chạy TUẦN TỰ (đoạn k chờ mọi đoạn trước xong) để nhận danh sách người
  // nói cộng dồn và giọng mẫu. Không thì chỉ đoạn 0 phải xong trước (lập danh sách người nói dùng chung).
  const voiceMode = opts.voiceRefs === true;
  const ready = (i: number) => (voiceMode ? chunks.every((c) => c.idx >= i || c.status === "done") : firstDone || i === 0);
  const candidates =
    idx !== undefined
      ? chunks.filter((c) => c.idx === idx)
      : chunks.filter((c) => c.status === "pending" || c.status === "processing").filter((c) => ready(c.idx));

  let claimedIdx: number | null = null;
  for (const c of candidates) {
    if (c.idx > 0 && !ready(c.idx)) continue;
    const { data } = await admin.rpc("claim_transcription_chunk", {
      p_job: jobId,
      p_idx: c.idx,
      p_stale_seconds: STALE_SECONDS,
    });
    if (data) {
      claimedIdx = c.idx;
      break;
    }
  }

  if (claimedIdx === null) {
    if (chunks.every((c) => c.status === "done")) {
      await triggerWorker(job.base_url ?? resolveBaseUrl(), { jobId, step: "finalize" });
    }
    return;
  }

  const chunk = chunks.find((c) => c.idx === claimedIdx)!;
  const analysis = jobAnalysis(job);
  const base = job.base_url ?? resolveBaseUrl();
  const startedAt = new Date().toISOString();
  try {
    const conn = await transcriptionConn(job);
    const ai = createGemini(conn);
    const glossary = await loadGlossaryForRecording(recording.id, [job.created_by ?? "", recording.owner_id]);
    const ctx = meetingContext(recording, glossary);
    // Danh sách người nói (và giọng mẫu, nếu phân vai bằng giọng mẫu) từ các đoạn trước
    let roster = chunk.idx > 0 ? analysis.roster : undefined;
    let voiceRefs: VoiceRef[] = [];
    if (voiceMode && chunk.idx > 0) {
      ({ roster, voiceRefs } = await speakerContextForChunk(admin, job, recording, chunk.idx, conn));
      await patchJob(admin, jobId, {
        stage: `Đang phiên âm đoạn ${chunk.idx + 1}/${chunks.length}${voiceRefs.length ? ` — so giọng với ${voiceRefs.length} giọng mẫu` : ""}`,
      });
    }
    const refParts: VoiceRefPart[] = voiceRefs.map((r) => ({
      label: voiceRefLabel(roster?.find((s) => s.key === r.key) ?? { key: r.key, name: "", role: null }),
      file: { name: r.fileName, uri: r.uri, mimeType: r.mimeType },
    }));
    const promptFor = (refs: VoiceRefPart[]) =>
      buildChunkPrompt({
        ctx,
        chunkIndex: chunk.idx,
        chunkCount: chunks.length,
        absoluteStart: Number(chunk.start_sec),
        absoluteEnd: Number(chunk.end_sec),
        roster,
        voiceRefKeys: refs.length ? voiceRefs.map((r) => r.key) : undefined,
      });
    const file: GeminiFileRef = { name: chunk.file_name!, uri: chunk.file_uri!, mimeType: chunk.mime_type ?? "audio/flac" };
    // Mô hình chính quá tải / hết lượt → dùng mô hình dự phòng của kết nối (nếu có); đoạn khác vừa phải
    // chuyển sang dự phòng thì đoạn này dùng luôn, khỏi chờ lỗi lại
    const preferFallback = !!analysis.fallbackSince && Date.now() - Date.parse(analysis.fallbackSince) < FALLBACK_STICKY_MS;
    const model = chunkModel(conn, chunk.attempts, chunk.error, preferFallback);
    const call = (f: GeminiFileRef, refs: VoiceRefPart[]) =>
      transcribeWithGemini(ai, { ...conn, model }, f, promptFor(refs), refs);
    const fileMissing = (err: unknown) => err instanceof AiError && err.kind === "file_missing";
    let reuploaded = false;
    let usedRefs = refParts;
    let callResult;
    try {
      callResult = await call(file, refParts).catch(async (err) => {
        if (!fileMissing(err)) throw err;
        // Có thể chính giọng mẫu trên Gemini không còn → thử không kèm giọng mẫu (đoạn sau cắt lại giọng mẫu)
        if (refParts.length) {
          try {
            const r = await call(file, []);
            usedRefs = [];
            await patchAnalysis(admin, jobId, { voiceRefs: [], voiceRefsBuiltThrough: -1 });
            return r;
          } catch (err2) {
            if (!fileMissing(err2)) throw err2;
          }
        }
        // Tệp đoạn trên Gemini không còn → tải lại từ tệp gốc rồi gọi lại ngay
        reuploaded = true;
        return call(await refreshChunkFile(admin, job, recording, chunk, conn), refParts);
      });
    } catch (err) {
      await markAuthFailure(conn, err);
      throw err;
    }
    const { result, finishReason } = callResult;
    // Mô hình lỡ phiên âm cả giọng mẫu → bỏ các câu trùng lời giọng mẫu
    const echo = dropVoiceRefEchoes(result.segments, usedRefs.length ? voiceRefs.map((r) => r.text) : []);
    result.segments = echo.kept;
    if (model !== conn.model && !preferFallback) {
      await patchAnalysis(admin, jobId, { fallbackSince: new Date().toISOString() });
    }

    const plan: ChunkPlan = {
      idx: chunk.idx,
      start: Number(chunk.start_sec),
      end: Number(chunk.end_sec),
      overlapBefore: analysis.plans?.find((p) => p.idx === chunk.idx)?.overlapBefore ?? 0,
    };
    const speechInChunk = totalLength(
      (analysis.speech ?? [])
        .map((s) => ({ start: Math.max(s.start, plan.start), end: Math.min(s.end, plan.end) }))
        .filter((s) => s.end > s.start),
    );
    if (result.segments.length === 0 && speechInChunk > 30) {
      throw new Error(`Mô hình không trả về nội dung cho đoạn có ${Math.round(speechInChunk)} giây tiếng nói`);
    }

    await admin
      .from("transcription_chunks")
      .update({
        status: "done",
        result: {
          ...result,
          finishReason,
          model,
          reuploaded,
          voiceRefs: usedRefs.length,
          echoesDropped: echo.dropped,
          startedAt,
        } as unknown as Json,
        error: null,
      })
      .eq("job_id", jobId)
      .eq("idx", chunk.idx);

    if (chunk.idx === 0) {
      await patchAnalysis(admin, jobId, { roster: rosterFromResult(plan, result) });
    }

    const { data: after } = await admin.from("transcription_chunks").select("idx,status").eq("job_id", jobId).eq("kind", "main");
    const done = (after ?? []).filter((c) => c.status === "done").length;
    const total = after?.length ?? chunks.length;
    await patchJob(admin, jobId, {
      done_chunks: done,
      progress: Math.round(10 + (75 * done) / total),
      stage: done < total ? `Đang phiên âm (${done}/${total} đoạn xong)` : "Đang hợp nhất kết quả",
    });

    if (done === total) {
      await triggerWorker(base, { jobId, step: "finalize" });
    } else if (chunk.idx === 0 && !voiceMode) {
      const pending = (after ?? []).filter((c) => c.status === "pending").length;
      await Promise.all(
        Array.from({ length: Math.min(CHUNK_CONCURRENCY, pending) }, () => triggerWorker(base, { jobId, step: "chunk" })),
      );
    } else {
      await triggerWorker(base, { jobId, step: "chunk" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // chunk.attempts là số lần nhận TRƯỚC lần này (claim đã +1 trong CSDL)
    const attempts = chunk.attempts + 1;
    const maxAttempts = maxAttemptsFor(err);
    if (attempts < maxAttempts) {
      const waitMs = retryDelayMs(err, attempts, RETRY_BASE_MS);
      // Trả đoạn về hàng chờ kèm hạn thử lại: worker khác không nhận sớm hơn hạn này
      await admin
        .from("transcription_chunks")
        .update({ status: "pending", error: message, next_attempt_at: new Date(Date.now() + waitMs).toISOString() })
        .eq("job_id", jobId)
        .eq("idx", chunk.idx);
      const conn = await transcriptionConn(job).catch(() => null);
      const next = conn ? chunkModel(conn, attempts, message) : null;
      const reason = message.includes(GEMINI_OVERLOADED)
        ? `${GEMINI_OVERLOADED} — đoạn ${chunk.idx + 1}`
        : message.includes(GEMINI_RATE_LIMITED)
          ? `${GEMINI_RATE_LIMITED} — đoạn ${chunk.idx + 1}`
          : `Đoạn ${chunk.idx + 1} lỗi`;
      const via = conn && next && next !== conn.model ? ` bằng mô hình dự phòng ${next}` : "";
      await patchJob(admin, jobId, {
        stage: `${reason}, tự thử lại${via} sau ${Math.round(waitMs / 1000)} giây (${attempts}/${maxAttempts})…`,
      });
      await triggerWorker(base, { jobId, step: "chunk", idx: chunk.idx });
    } else {
      await admin
        .from("transcription_chunks")
        .update({ status: "error", error: message })
        .eq("job_id", jobId)
        .eq("idx", chunk.idx);
      const hint = isTransientError(err) ? " Bấm “Thử lại” sau ít phút, hoặc đặt mô hình dự phòng trong kết nối AI." : "";
      throw new Error(`Đoạn ${chunk.idx + 1} phiên âm thất bại sau ${attempts} lần: ${message}.${hint}`);
    }
  }
}

/**
 * Phân vai bằng giọng mẫu: trước khi phiên âm đoạn k, thống nhất người nói của các đoạn 0..k-1 (khoá toàn cục)
 * và cắt giọng mẫu cho người nói chưa có mẫu (mỗi người một lần, tối đa MAX_VOICE_REFS, ưu tiên người nói nhiều).
 * Lỗi khi cắt / tải giọng mẫu chỉ ghi cảnh báo — đoạn vẫn được phiên âm.
 */
async function speakerContextForChunk(
  admin: Admin,
  job: Job,
  recording: Recording,
  chunkIdx: number,
  conn: ConnectionConfig,
): Promise<{ roster: Speaker[]; voiceRefs: VoiceRef[] }> {
  const analysis = jobAnalysis(job);
  const { data: prev } = await admin
    .from("transcription_chunks")
    .select("idx,start_sec,end_sec,status,result")
    .eq("job_id", job.id)
    .eq("kind", "main")
    .lt("idx", chunkIdx)
    .order("idx");
  const outputs = (prev ?? [])
    .filter((c) => c.status === "done" && c.result)
    .map((c) => ({
      plan: {
        idx: c.idx,
        start: Number(c.start_sec),
        end: Number(c.end_sec),
        overlapBefore: analysis.plans?.find((p) => p.idx === c.idx)?.overlapBefore ?? 0,
      },
      result: c.result as unknown as RawChunkResult,
    }));
  const reconciled = reconcileSpeakers(
    outputs.map((o) => ({
      chunkIdx: o.plan.idx,
      speakers: o.result.speakers ?? [],
      talkTime: talkTimeBySpeaker(toAbsoluteSegments(o.plan, o.result)),
    })),
  );
  const segments = outputs.flatMap((o) =>
    toAbsoluteSegments(o.plan, o.result, (local) => reconciled.mapping[`${o.plan.idx}:${local}`] ?? local),
  );
  const talk = talkTimeBySpeaker(segments);
  const roster = reconciled.speakers
    .filter((s) => (talk[s.key] ?? 0) > 0)
    .sort((a, b) => (talk[b.key] ?? 0) - (talk[a.key] ?? 0));

  let voiceRefs = (analysis.voiceRefs ?? []).filter((r) => roster.some((s) => s.key === r.key));
  if ((analysis.voiceRefsBuiltThrough ?? -1) < chunkIdx - 1) {
    const have = new Set(voiceRefs.map((r) => r.key));
    const wanted = roster
      .filter((s) => !have.has(s.key) && (talk[s.key] ?? 0) >= MIN_TALK_SEC_FOR_REF)
      .slice(0, Math.max(0, MAX_VOICE_REFS - voiceRefs.length))
      .map((s) => s.key);
    const picks = pickVoiceRefSegments(segments, wanted);
    const warnings = [...(analysis.warnings ?? [])];
    if (picks.size) {
      await patchJob(admin, job.id, { stage: `Đang cắt giọng mẫu của ${picks.size} người nói` });
      try {
        const made = await withTempDir(async (dir) => {
          const onDrive = Boolean(recording.drive_file_id) && recording.upload_status === "uploaded";
          const sizeBytes = Number(recording.size_bytes ?? 0);
          const { src } = onDrive
            ? await openOriginal(dir, recording.drive_file_id!, sizeBytes)
            : await openTempOriginal(dir, recording.id, sizeBytes);
          const ai = createGemini(conn);
          const enc = encodeOptions(jobOptions(job), analysis.meanVolumeDb ?? null);
          return mapLimit([...picks], 3, async ([key, p]): Promise<VoiceRef> => {
            const out = path.join(dir, `voice-${key}.flac`);
            await encodeChunk(src, p.start, p.end, out, enc);
            const f = await uploadToGemini(ai, out, "audio/flac", `rec-${recording.id}-voice-${key}-${p.start}-${p.end}`);
            return { key, start: p.start, end: p.end, text: p.text, uri: f.uri, fileName: f.name, mimeType: f.mimeType };
          });
        });
        voiceRefs = [...voiceRefs, ...made];
      } catch (err) {
        warnings.push(`Không tạo được giọng mẫu trước đoạn ${chunkIdx + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await patchAnalysis(admin, job.id, { roster, voiceRefs, voiceRefsBuiltThrough: chunkIdx - 1, warnings });
  }
  return { roster, voiceRefs };
}

function rosterFromResult(plan: ChunkPlan, result: RawChunkResult): Speaker[] {
  const segs = toAbsoluteSegments(plan, result);
  const talk = talkTimeBySpeaker(segs);
  const keys = new Set<string>([...result.speakers.map((s) => normalizeSpeakerId(s.id)), ...Object.keys(talk)]);
  return [...keys]
    .map((key) => {
      const info = result.speakers.find((s) => normalizeSpeakerId(s.id) === key);
      return {
        key,
        name: info?.name?.trim() || defaultSpeakerName(key),
        role: info?.role?.trim() || null,
        description: info?.description?.trim() || null,
      };
    })
    .sort((a, b) => (talk[b.key] ?? 0) - (talk[a.key] ?? 0));
}

// ---------------------------------------------------------------------------
// Bước 2b: chờ Soniox
// ---------------------------------------------------------------------------

async function pollSonioxUntil(admin: Admin, jobId: string, deadline: number) {
  const loaded = await loadJob(admin, jobId);
  if (!loaded) return;
  const { job } = loaded;
  const soniox = jobAnalysis(job).soniox;
  if (!soniox) return;
  const conn = await transcriptionConn(job);
  let delay = 3000;
  while (Date.now() < deadline) {
    const st = await sonioxGetStatus(conn, soniox.transcriptionId);
    if (st.status === "completed") {
      await triggerWorker(job.base_url ?? resolveBaseUrl(), { jobId, step: "finalize" });
      return;
    }
    if (st.status === "error") throw new Error(`Soniox báo lỗi: ${st.error_message ?? "không rõ"}`);
    await patchJob(admin, jobId, {
      stage: st.status === "queued" ? "Đang chờ Soniox xử lý…" : "Soniox đang phiên âm và phân vai người nói…",
    });
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15_000);
  }
}

async function stepSonioxPoll(admin: Admin, jobId: string) {
  const loaded = await loadJob(admin, jobId);
  if (!loaded || loaded.job.status !== "transcribing") return;
  await pollSonioxUntil(admin, jobId, Date.now() + STEP_BUDGET_MS);
}

// ---------------------------------------------------------------------------
// Bước 3: hoàn tất
// ---------------------------------------------------------------------------

async function stepFinalize(admin: Admin, jobId: string) {
  const claimed = await admin.rpc("claim_job", {
    p_job: jobId,
    p_from: ["transcribing"],
    p_to: "finalizing",
    p_stale_seconds: STALE_SECONDS,
  });
  if (!claimed.data) return;
  const loaded = await loadJob(admin, jobId);
  if (!loaded) return;
  const { job, recording } = loaded;
  const opts = jobOptions(job);
  const analysis = jobAnalysis(job);
  const deadline = Date.now() + STEP_BUDGET_MS - 20_000;
  const warnings: string[] = [...(analysis.warnings ?? [])];
  const glossary = await loadGlossaryForRecording(recording.id, [job.created_by ?? "", recording.owner_id]);
  const ctx = meetingContext(recording, glossary);

  let segments: Segment[];
  let speakers: Speaker[];
  let duplicatesRemoved = 0;
  let repetitionsTrimmed = 0;
  let gapFillsAttempted = 0;
  let gapFillsRecovered = 0;
  // Mô hình THỰC đã phiên âm (khác job.model khi phải chạy mô hình dự phòng)
  let servedModel = job.model;
  const cleanup: (() => Promise<void>)[] = [];

  if (opts.engine === "soniox") {
    await patchJob(admin, jobId, { stage: "Đang lấy kết quả từ Soniox", progress: 88 });
    const conn = await transcriptionConn(job);
    const soniox = analysis.soniox!;
    const tokens = await sonioxGetTokens(conn, soniox.transcriptionId);
    segments = assignIds(tokensToSegments(tokens));
    const keys = [...new Set(segments.map((s) => s.speaker))];
    speakers = keys.map((key) => ({ key, name: defaultSpeakerName(key), role: null }));
    cleanup.push(() => sonioxCleanup(conn, soniox.transcriptionId, soniox.fileId));
  } else {
    await patchJob(admin, jobId, { stage: "Đang hợp nhất các đoạn", progress: 87 });
    const { data: chunks } = await admin.from("transcription_chunks").select("*").eq("job_id", jobId).order("idx");
    const main = (chunks ?? []).filter((c) => c.kind === "main" && c.status === "done");
    const plans: ChunkPlan[] = main.map((c) => ({
      idx: c.idx,
      start: Number(c.start_sec),
      end: Number(c.end_sec),
      overlapBefore: analysis.plans?.find((p) => p.idx === c.idx)?.overlapBefore ?? 0,
    }));
    const outputs = main.map((c, i) => ({ plan: plans[i], result: c.result as unknown as RawChunkResult }));

    // Thống nhất người nói giữa các đoạn
    const rosters: ChunkRoster[] = outputs.map((o) => {
      const segs = toAbsoluteSegments(o.plan, o.result);
      return { chunkIdx: o.plan.idx, speakers: o.result.speakers ?? [], talkTime: talkTimeBySpeaker(segs) };
    });
    const reconciled = reconcileSpeakers(rosters);
    const mapFor = (chunkIdx: number) => (local: string) => reconciled.mapping[`${chunkIdx}:${local}`] ?? local;
    const merged = mergeChunkOutputs(outputs, mapFor);
    segments = merged.segments;
    speakers = reconciled.speakers;
    duplicatesRemoved = merged.duplicatesRemoved;
    repetitionsTrimmed = merged.repetitionsTrimmed;
    if (outputs.some((o) => o.result.truncated)) warnings.push("Một số đoạn bị cắt cụt đầu ra — đã quét bổ sung.");
    const viaFallback = main.filter((c) => {
      const m = (c.result as { model?: string } | null)?.model;
      return m && m !== job.model;
    });
    if (viaFallback.length) {
      const models = [...new Set(viaFallback.map((c) => (c.result as { model?: string }).model))].join(", ");
      warnings.push(`Đoạn ${viaFallback.map((c) => c.idx + 1).join(", ")} dùng mô hình dự phòng ${models} vì ${job.model} quá tải.`);
    }
    if (job.model) servedModel = servedModelLabel(job.model, main.map((c) => (c.result as { model?: string } | null)?.model));
    const reuploadedChunks = main.filter((c) => (c.result as { reuploaded?: boolean } | null)?.reuploaded);
    if (reuploadedChunks.length) {
      warnings.push(`Tệp âm thanh đoạn ${reuploadedChunks.map((c) => c.idx + 1).join(", ")} trên Gemini không còn — đã tải lại từ tệp gốc.`);
    }

    // Quét khoảng trống: phần có tiếng nói nhưng chưa có chữ → phiên âm lại cửa sổ đó
    if (opts.gapFill !== false && analysis.speech?.length) {
      const coverage = computeCoverage(segments, analysis.speech, { minGapSec: 8 });
      const windows = coverage.gaps
        .flatMap((g) => splitGapByChunks(g, plans))
        .sort((a, b) => b.gap.end - b.gap.start - (a.gap.end - a.gap.start))
        .slice(0, 10);
      if (windows.length) {
        await patchJob(admin, jobId, { stage: `Đang quét ${windows.length} khoảng nghi bỏ sót`, progress: 90 });
        const conn = await transcriptionConn(job);
        const ai = createGemini(conn);
        const globalKeys = new Set(speakers.map((s) => s.key));
        const results = await mapLimit(windows, 3, async (w) => {
          if (Date.now() > deadline - 60_000) return null;
          gapFillsAttempted++;
          const chunk = main.find((c) => c.idx === w.plan.idx)!;
          const rel = { start: Math.max(0, w.gap.start - w.plan.start - 2), end: w.gap.end - w.plan.start + 2 };
          try {
            const gapFile = { name: chunk.file_name!, uri: chunk.file_uri!, mimeType: chunk.mime_type ?? "audio/flac" };
            const gapPrompt = buildGapPrompt({
              ctx,
              chunkIndex: w.plan.idx,
              chunkCount: plans.length,
              absoluteStart: w.plan.start,
              absoluteEnd: w.plan.end,
              roster: speakers,
              windowStart: rel.start,
              windowEnd: rel.end,
            });
            const fallback = fallbackModelFor(conn);
            const { result } = await transcribeWithGemini(ai, conn, gapFile, gapPrompt).catch((err) => {
              // Mô hình chính quá tải → quét lại bằng mô hình dự phòng
              if (fallback && isCapacityError(err)) {
                return transcribeWithGemini(ai, { ...conn, model: fallback }, gapFile, gapPrompt);
              }
              throw err;
            });
            // Lượt quét nhận danh sách người nói TOÀN CỤC → giữ nguyên khoá toàn cục; khoá khác ánh xạ theo đoạn
            const mapGap = (local: string) => (globalKeys.has(local) ? local : mapFor(w.plan.idx)(local));
            const drafts = toAbsoluteSegments(w.plan, result, mapGap).filter(
              (d) => parseTimecode(d.start) >= 0,
            );
            return { gap: w.gap, drafts };
          } catch (err) {
            warnings.push(`Không quét được khoảng ${Math.round(w.gap.start)}–${Math.round(w.gap.end)} s: ${String(err)}`);
            return null;
          }
        });
        for (const r of results) {
          if (!r) continue;
          const mergedGap = mergeGapSegments(segments, r.drafts, r.gap);
          if (mergedGap.added > 0) gapFillsRecovered++;
          segments = mergedGap.segments;
        }
      }
    }
    const cleanupConn = await transcriptionConn(job).catch(() => null);
    for (const c of main) {
      cleanup.push(async () => {
        if (cleanupConn && c.file_name) await deleteGeminiFile(createGemini(cleanupConn), c.file_name);
      });
    }
    for (const r of analysis.voiceRefs ?? []) {
      cleanup.push(async () => {
        if (cleanupConn) await deleteGeminiFile(createGemini(cleanupConn), r.fileName);
      });
    }
  }

  // Bản máy gốc: đầu ra nhận dạng TRƯỚC khi AI hiệu đính thuật ngữ — lưu vào original_segments để đối chiếu/khôi phục
  let machineSegments = segments;

  // Hiệu đính thuật ngữ (đề xuất có kiểm chứng) — mặc định bật cho Soniox
  if (opts.correctTerms && Date.now() < deadline - 60_000) {
    const corrConn = await resolveConnection("term_correction", job.created_by);
    if (corrConn) {
      await patchJob(admin, jobId, { stage: "Đang hiệu đính thuật ngữ y khoa", progress: 93 });
      const corrected = await correctTerms({
        segments,
        glossary,
        conn: corrConn,
        contextLine: `Cuộc họp: ${ctx.title} (${CATEGORY_LABELS[ctx.category] ?? ctx.category})`,
        deadline: deadline - 45_000,
      });
      segments = corrected.segments;
      if (corrected.applied) warnings.push(`AI đã hiệu đính ${corrected.applied} thuật ngữ (đánh dấu trong transcript).`);
    } else {
      warnings.push("Chưa có kết nối AI cho bước hiệu đính thuật ngữ — bỏ qua.");
    }
  }

  // Nhận diện tên người nói
  if (opts.nameSpeakers !== false && segments.length > 0 && Date.now() < deadline - 25_000) {
    const namingConn = await resolveConnection("speaker_naming", job.created_by);
    if (namingConn) {
      await patchJob(admin, jobId, { stage: "Đang nhận diện tên người nói", progress: 95 });
      try {
        const talk = talkTimeBySpeaker(segments);
        const naming = await generateJson<SpeakerNamingResult>({
          conn: namingConn,
          system: SPEAKER_NAMING_SYSTEM,
          schema: SPEAKER_NAMING_SCHEMA as unknown as Record<string, unknown>,
          schemaName: "speaker_naming",
          overrides: { effort: namingConn.params.effort ?? "medium" },
          messages: [{ role: "user", content: buildSpeakerNamingInput(ctx, speakers, segments, talk) }],
        });
        const before = speakers;
        ({ segments, speakers } = applySpeakerNaming(segments, before, naming));
        // Cùng phép gộp người nói cho bản máy gốc để khoá người nói luôn khớp danh sách
        machineSegments = applySpeakerNaming(machineSegments, before, naming).segments;
      } catch (err) {
        await markAuthFailure(namingConn, err);
        warnings.push(`Không tự nhận diện được tên người nói: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push("Chưa có kết nối AI cho bước nhận diện tên người nói.");
    }
  }

  // Chỉ giữ người nói có xuất hiện, sắp theo thứ tự lên tiếng
  const order: string[] = [];
  for (const s of segments) if (!order.includes(s.speaker)) order.push(s.speaker);
  speakers = order.map((key) => speakers.find((s) => s.key === key) ?? { key, name: defaultSpeakerName(key), role: null });

  const coverage = analysis.speech?.length
    ? computeCoverage(segments, analysis.speech, { minGapSec: 8 })
    : { speechSec: 0, coveredSec: 0, ratio: 1, gaps: [] };
  const quality: TranscriptQuality = {
    durationSec: analysis.durationSec ?? Number(recording.duration_sec ?? 0),
    speechSec: Math.round(coverage.speechSec),
    coveredSpeechSec: Math.round(coverage.coveredSec),
    coverageRatio: Math.round(coverage.ratio * 1000) / 1000,
    uncoveredGaps: coverage.gaps,
    gapFillsAttempted,
    gapFillsRecovered,
    repetitionsTrimmed,
    duplicatesRemoved,
    warnings,
  };

  await patchJob(admin, jobId, { stage: "Đang lưu transcript", progress: 98 });
  const searchText = stripDiacritics(
    [...speakers.map((s) => s.name), ...segments.map((s) => s.text)].join(" ").toLowerCase(),
  );
  const { data: existing } = await admin
    .from("transcripts")
    .select("version")
    .eq("recording_id", recording.id)
    .maybeSingle();
  const { error } = await admin.from("transcripts").upsert({
    recording_id: recording.id,
    segments: segments as unknown as Json,
    original_segments: machineSegments as unknown as Json,
    speakers: speakers as unknown as Json,
    engine: opts.engine,
    model: servedModel,
    quality: quality as unknown as Json,
    search_text: searchText,
    version: (existing?.version ?? 0) + 1,
    edited_by: null,
  });
  if (error) throw new Error(`Không lưu được transcript: ${error.message}`);

  await patchJob(admin, jobId, {
    status: "done",
    stage: "Hoàn tất",
    progress: 100,
    finished_at: new Date().toISOString(),
    analysis: { ...analysis, warnings } as unknown as Json,
  });
  await admin
    .from("recordings")
    .update({ status: "ready", status_message: null, duration_sec: quality.durationSec || recording.duration_sec })
    .eq("id", recording.id);

  // Phiên âm không lưu tệp: xoá tệp tạm ngay khi đã có transcript
  if (recording.upload_status === "temporary") {
    cleanup.push(async () => {
      await discardTempAudio(recording.id, jobId);
    });
  }
  const cleaned = await Promise.allSettled(cleanup.map((fn) => fn()));
  for (const c of cleaned) if (c.status === "rejected") console.error(`[job ${jobId}] dọn dẹp`, c.reason);

  if (opts.autoReportTemplate) {
    await triggerWorker(job.base_url ?? resolveBaseUrl(), { jobId, step: "autoreport" });
  }
}

/** Tách một khoảng trống theo ranh giới đoạn (để quét lại trên đúng tệp đoạn). */
function splitGapByChunks(gap: Interval, plans: ChunkPlan[]): { gap: Interval; plan: ChunkPlan }[] {
  const out: { gap: Interval; plan: ChunkPlan }[] = [];
  for (const plan of plans) {
    const start = Math.max(gap.start, plan.start);
    const end = Math.min(gap.end, plan.end);
    if (end - start >= 5) out.push({ gap: { start, end }, plan });
  }
  return out;
}

export function applySpeakerNaming(
  segments: Segment[],
  speakers: Speaker[],
  naming: SpeakerNamingResult,
): { segments: Segment[]; speakers: Speaker[] } {
  const keys = new Set(speakers.map((s) => s.key));
  const merges = new Map<string, string>();
  for (const m of naming.merges ?? []) {
    if (m.confidence !== "high" || !keys.has(m.from) || !keys.has(m.into) || m.from === m.into) continue;
    merges.set(m.from, m.into);
  }
  const resolve = (k: string) => {
    let cur = k;
    for (let i = 0; i < 10 && merges.has(cur); i++) cur = merges.get(cur)!;
    return cur;
  };
  const nextSegments = segments.map((s) => (merges.has(s.speaker) ? { ...s, speaker: resolve(s.speaker) } : s));
  const nextSpeakers = speakers
    .filter((s) => !merges.has(s.key))
    .map((s) => {
      const n = naming.speakers?.find((x) => x.key === s.key);
      if (!n || n.confidence === "low" || !singleLabel(n.name)) {
        return { ...s, role: s.role || singleLabel(n?.role) || null };
      }
      return { ...s, name: singleLabel(n.name), role: singleLabel(n.role) || s.role || null };
    });
  return { segments: nextSegments, speakers: nextSpeakers };
}

// ---------------------------------------------------------------------------
// Bước 4 (tuỳ chọn): tự sinh báo cáo sau khi phiên âm xong
// ---------------------------------------------------------------------------

async function stepAutoReport(admin: Admin, jobId: string) {
  const loaded = await loadJob(admin, jobId);
  if (!loaded || loaded.job.status !== "done") return;
  const opts = jobOptions(loaded.job);
  if (!opts.autoReportTemplate || !loaded.job.created_by) return;
  const { generateReportToDb } = await import("@/lib/reports/generate");
  await generateReportToDb({
    recordingId: loaded.recording.id,
    templateKey: opts.autoReportTemplate,
    userId: loaded.job.created_by,
  });
}
