import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/database.types";
import { requireConnection } from "@/lib/ai/connections";
import { serverEnv } from "@/lib/env";
import { sleep } from "@/lib/utils";

/**
 * Điều phối tác vụ phiên âm (không phụ thuộc ffmpeg — để các route API nhẹ).
 * Phần xử lý nặng nằm trong pipeline.ts, chỉ worker nạp.
 */

type Job = Tables<"transcription_jobs">;
type Recording = Tables<"recordings">;
type Admin = ReturnType<typeof createAdminClient>;

export type Engine = "gemini" | "soniox";
/** "gain": chuẩn hoá tuyến tính (mặc định); "loudnorm" là tên cũ, được hiểu như "gain". */
export type NormalizeMode = "gain" | "dynaudnorm" | "none";

export interface JobOptions {
  engine: Engine;
  /** Kết nối AI dùng để phiên âm (null = khoá trong biến môi trường). */
  connectionId?: string | null;
  model?: string;
  chunkMinutes?: number;
  normalize?: NormalizeMode;
  denoise?: boolean;
  gapFill?: boolean;
  nameSpeakers?: boolean;
  correctTerms?: boolean;
  autoReportTemplate?: string | null;
}

export type WorkerStep = "prepare" | "chunk" | "soniox_poll" | "finalize" | "autoreport";

export interface WorkerPayload {
  jobId: string;
  step: WorkerStep;
  idx?: number;
}

/** Ngưỡng coi một bước là "treo" — phải lớn hơn maxDuration của worker (300 s). */
export const STALE_SECONDS = 420;

export function jobOptions(job: Job): JobOptions {
  const o = (job.options as unknown as Partial<JobOptions>) ?? {};
  return { ...o, engine: o.engine ?? "gemini" };
}

export async function loadJob(admin: Admin, jobId: string): Promise<{ job: Job; recording: Recording } | null> {
  const { data: job } = await admin.from("transcription_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: recording } = await admin.from("recordings").select("*").eq("id", job.recording_id).maybeSingle();
  if (!recording) return null;
  return { job, recording };
}

export function resolveBaseUrl(requestUrl?: string): string {
  const explicit = serverEnv.appUrl();
  if (explicit) return explicit.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Gọi worker (một lần thực thi hàm riêng) — worker trả 202 ngay và chạy việc trong after(). */
export async function triggerWorker(baseUrl: string, payload: WorkerPayload): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-worker-secret": serverEnv.workerSecret(),
  };
  const bypass = serverEnv.vercelBypassSecret();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/internal/worker`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return;
      console.error(`triggerWorker ${payload.step} → HTTP ${res.status}`);
    } catch (err) {
      console.error(`triggerWorker ${payload.step} lỗi`, err);
    }
    await sleep(1000 * (attempt + 1));
  }
}

// ---------------------------------------------------------------------------
// Khởi tạo job
// ---------------------------------------------------------------------------

export async function startTranscription(params: {
  recordingId: string;
  userId: string;
  options: Partial<JobOptions>;
  baseUrl: string;
}): Promise<Job> {
  const admin = createAdminClient();
  const { data: recording } = await admin.from("recordings").select("*").eq("id", params.recordingId).single();
  if (!recording) throw new Error("Không tìm thấy bản ghi");
  const onDrive = Boolean(recording.drive_file_id) && recording.upload_status === "uploaded";
  if (!onDrive && recording.upload_status !== "temporary") {
    throw new Error(
      recording.upload_status === "uploading"
        ? "Tệp âm thanh chưa tải lên xong"
        : "Chưa có tệp ghi âm — hãy tải tệp lên trước khi phiên âm",
    );
  }

  // Tránh chạy trùng
  const { data: active } = await admin
    .from("transcription_jobs")
    .select("*")
    .eq("recording_id", params.recordingId)
    .in("status", ["queued", "preparing", "transcribing", "finalizing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active && Date.now() - new Date(active.updated_at).getTime() < STALE_SECONDS * 1000) {
    return active;
  }
  if (active) {
    await admin.from("transcription_jobs").update({ status: "canceled", stage: "Đã thay bằng lượt mới" }).eq("id", active.id);
  }

  const conn = await requireConnection("transcription", params.userId, params.options.connectionId);
  const engine: Engine = conn.provider === "soniox" ? "soniox" : "gemini";
  if (conn.provider !== "soniox" && conn.provider !== "gemini") {
    throw new Error("Kết nối phiên âm phải là Gemini hoặc Soniox");
  }
  const options: JobOptions = {
    engine,
    connectionId: conn.id ?? null,
    model: conn.model,
    chunkMinutes: Math.min(20, Math.max(5, params.options.chunkMinutes ?? 10)),
    normalize: (["gain", "dynaudnorm", "none"] as const).find((m) => m === params.options.normalize) ?? "gain",
    denoise: params.options.denoise ?? false,
    gapFill: params.options.gapFill ?? true,
    nameSpeakers: params.options.nameSpeakers ?? true,
    correctTerms: params.options.correctTerms ?? engine === "soniox",
    autoReportTemplate: params.options.autoReportTemplate ?? null,
  };

  const { data: job, error } = await admin
    .from("transcription_jobs")
    .insert({
      recording_id: params.recordingId,
      created_by: params.userId,
      status: "queued",
      stage: "Đang xếp hàng",
      engine,
      model: options.model,
      options: options as unknown as Json,
      base_url: params.baseUrl,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !job) throw new Error(`Không tạo được tác vụ: ${error?.message}`);
  await admin.from("recordings").update({ status: "queued", status_message: null }).eq("id", params.recordingId);
  return job;
}

/** Khôi phục job bị treo (được gọi khi người dùng mở trang và thấy tiến độ đứng yên). */
export async function resumeJob(jobId: string): Promise<boolean> {
  const admin = createAdminClient();
  const loaded = await loadJob(admin, jobId);
  if (!loaded) return false;
  const { job } = loaded;
  const idleMs = Date.now() - new Date(job.updated_at).getTime();
  const base = job.base_url ?? resolveBaseUrl();
  const opts = jobOptions(job);
  if (job.status === "queued") {
    await triggerWorker(base, { jobId, step: "prepare" });
    return true;
  }
  if (job.status === "transcribing") {
    if (opts.engine === "soniox") await triggerWorker(base, { jobId, step: "soniox_poll" });
    else await triggerWorker(base, { jobId, step: "chunk" });
    return true;
  }
  if (idleMs < STALE_SECONDS * 1000) return false;
  if (job.status === "preparing") {
    await triggerWorker(base, { jobId, step: "prepare" });
    return true;
  }
  if (job.status === "finalizing") {
    await triggerWorker(base, { jobId, step: "finalize" });
    return true;
  }
  return false;
}

