import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumeJob, STALE_SECONDS } from "@/lib/transcription/pipeline";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;

/** Vercel Cron: tìm tác vụ bị treo và khởi động lại (Hobby: 1 lần/ngày; Pro: tuỳ chỉnh). */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  if (!expected || !safeEqual(auth, expected)) return new Response("Forbidden", { status: 403 });
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();
  const { data: jobs } = await admin
    .from("transcription_jobs")
    .select("id")
    .in("status", ["queued", "preparing", "transcribing", "finalizing"])
    .lt("updated_at", cutoff)
    .limit(20);
  let resumed = 0;
  for (const j of jobs ?? []) if (await resumeJob(j.id)) resumed++;
  return Response.json({ checked: jobs?.length ?? 0, resumed });
}
