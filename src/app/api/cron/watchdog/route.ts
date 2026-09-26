import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumeJob, STALE_SECONDS } from "@/lib/transcription/jobs";
import { safeEqual } from "@/lib/crypto";
import { TEMP_AUDIO_TTL_DAYS } from "@/lib/audio/limits";
import { discardTempAudio, removeTempAudio, TEMP_SESSION } from "@/lib/storage/temp-audio";

export const maxDuration = 60;

/**
 * Vercel Cron (Hobby: 1 lần/ngày; Pro: tuỳ chỉnh):
 *  - tìm tác vụ phiên âm bị treo và khởi động lại;
 *  - xoá tệp tạm (phiên âm không lưu tệp) để quá TEMP_AUDIO_TTL_DAYS ngày mà chưa phiên âm xong.
 */
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

  const expired = new Date(Date.now() - TEMP_AUDIO_TTL_DAYS * 86_400_000).toISOString();
  const { data: stale } = await admin
    .from("recordings")
    .select("id")
    .eq("upload_status", "temporary")
    .lt("updated_at", expired)
    .limit(20);
  let tempRemoved = 0;
  for (const r of stale ?? []) {
    if (await discardTempAudio(r.id).catch((e) => (console.error("watchdog temp", r.id, e), false))) tempRemoved++;
  }
  // Tải lên tạm bỏ dở
  const { data: abandoned } = await admin
    .from("upload_sessions")
    .select("recording_id")
    .eq("session_uri", TEMP_SESSION)
    .lt("created_at", expired)
    .limit(20);
  for (const s of abandoned ?? []) {
    try {
      await removeTempAudio(s.recording_id);
      await admin.from("upload_sessions").delete().eq("recording_id", s.recording_id);
      await admin.from("recordings").update({ upload_status: "failed" }).eq("id", s.recording_id).eq("upload_status", "uploading");
      tempRemoved++;
    } catch (e) {
      console.error("watchdog temp upload", s.recording_id, e);
    }
  }
  return Response.json({ checked: jobs?.length ?? 0, resumed, tempRemoved });
}
