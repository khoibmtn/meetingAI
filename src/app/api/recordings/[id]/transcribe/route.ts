import { after, type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { resolveBaseUrl, startTranscription, triggerWorker, type JobOptions } from "@/lib/transcription/jobs";

export const maxDuration = 30;

/** Bắt đầu phiên âm một bản ghi (người có quyền sửa bản ghi). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireApiUser();
    const { data: canEdit } = await supabase.rpc("can_edit_recording", { rid: id });
    if (!canEdit) throw new HttpError(403, "Bạn không có quyền phiên âm bản ghi này");
    const options = ((await request.json().catch(() => ({}))) ?? {}) as Partial<JobOptions>;
    const baseUrl = resolveBaseUrl(request.url);
    const job = await startTranscription({ recordingId: id, userId: user.id, options, baseUrl });
    if (job.status === "queued") {
      after(() => triggerWorker(baseUrl, { jobId: job.id, step: "prepare" }));
    }
    return Response.json({ job });
  } catch (err) {
    return jsonError(err);
  }
}
