import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { trashDriveFile } from "@/lib/drive/google";
import { removeTempAudio } from "@/lib/storage/temp-audio";

/** Xoá bản ghi (chỉ chủ sở hữu). Tệp trên Drive được chuyển vào Thùng rác (khôi phục được 30 ngày); tệp tạm bị xoá. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireApiUser();
    const { data: recording } = await supabase
      .from("recordings")
      .select("id, owner_id, drive_file_id, upload_status")
      .eq("id", id)
      .maybeSingle();
    if (!recording) throw new HttpError(404, "Không tìm thấy bản ghi");
    if (recording.owner_id !== user.id) throw new HttpError(403, "Chỉ người tạo được xoá bản ghi");
    if (recording.drive_file_id) {
      await trashDriveFile(recording.drive_file_id).catch((e) => console.error("trash drive", e));
    }
    if (recording.upload_status !== "uploaded") {
      await removeTempAudio(id).catch((e) => console.error("remove temp audio", e));
    }
    const { error } = await createAdminClient().from("recordings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
