import { after, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBaseUrl, triggerWorker } from "@/lib/transcription/jobs";

/** Soniox gọi khi phiên âm xong/lỗi (xác thực bằng header bí mật đã đăng ký khi tạo tác vụ). */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(secret, serverEnv.workerSecret())) return new Response("Forbidden", { status: 403 });
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) return new Response("Missing job", { status: 400 });
  const { data: job } = await createAdminClient().from("transcription_jobs").select("base_url").eq("id", jobId).maybeSingle();
  if (!job) return new Response("Unknown job", { status: 404 });
  const base = job.base_url ?? resolveBaseUrl(request.url);
  after(() => triggerWorker(base, { jobId, step: "soniox_poll" }));
  return Response.json({ ok: true });
}
