import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { resumeJob } from "@/lib/transcription/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * Khôi phục tác vụ phiên âm bị đứng (worker hết giờ/lỗi mạng). Giao diện tự gọi khi thấy
 * tiến độ không đổi quá lâu; cũng dùng cho nút "Thử lại" (reset các đoạn lỗi).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const { data: job } = await supabase.from("transcription_jobs").select("*").eq("id", id).maybeSingle();
    if (!job) throw new HttpError(404, "Không tìm thấy tác vụ");
    const { retryFailed } = (await request.json().catch(() => ({}))) as { retryFailed?: boolean };
    if (retryFailed && job.status === "error") {
      const { data: canEdit } = await supabase.rpc("can_edit_recording", { rid: job.recording_id });
      if (!canEdit) throw new HttpError(403, "Không có quyền");
      const admin = createAdminClient();
      const { data: chunks } = await admin.from("transcription_chunks").select("idx,status").eq("job_id", id);
      const hasChunks = (chunks ?? []).length > 0;
      await admin.from("transcription_chunks").update({ status: "pending", attempts: 0, error: null }).eq("job_id", id).eq("status", "error");
      const allDone = hasChunks && (chunks ?? []).every((c) => c.status === "done");
      await admin
        .from("transcription_jobs")
        .update({
          status: !hasChunks ? "queued" : allDone ? "transcribing" : "transcribing",
          error: null,
          stage: "Đang thử lại…",
          finished_at: null,
        })
        .eq("id", id);
      await admin.from("recordings").update({ status: "processing", status_message: null }).eq("id", job.recording_id);
    }
    const resumed = await resumeJob(id);
    return Response.json({ resumed });
  } catch (err) {
    return jsonError(err);
  }
}
