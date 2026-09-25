import { after, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { runWorkerStep } from "@/lib/transcription/pipeline";
import { ffmpegSelfTest } from "@/lib/audio/ffmpeg";
import type { WorkerPayload } from "@/lib/transcription/jobs";

/**
 * Worker xử lý nền. Mỗi bước là một lần thực thi hàm riêng (tối đa maxDuration):
 * trả 202 ngay rồi chạy việc trong after(). Chỉ nhận yêu cầu có WORKER_SECRET.
 * (Gói Vercel Pro có thể nâng maxDuration lên 800 và tăng STALE_SECONDS tương ứng.)
 */
export const maxDuration = 300;

const STEPS = new Set(["prepare", "chunk", "soniox_poll", "finalize", "autoreport"]);

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-worker-secret") ?? "";
  if (!safeEqual(secret, serverEnv.workerSecret())) {
    return new Response("Forbidden", { status: 403 });
  }
  const payload = (await request.json().catch(() => null)) as WorkerPayload | null;
  // Tự kiểm tra (trang Kiểm tra hệ thống): chạy đồng bộ, không cần job
  if ((payload as { step?: string } | null)?.step === "health") {
    try {
      const r = await ffmpegSelfTest();
      return Response.json({ ok: true, ffmpeg: r.version, ms: r.ms, region: process.env.VERCEL_REGION ?? null });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  if (!payload?.jobId || !STEPS.has(payload.step)) {
    return new Response("Bad request", { status: 400 });
  }
  after(() => runWorkerStep(payload));
  return Response.json({ accepted: true }, { status: 202 });
}
