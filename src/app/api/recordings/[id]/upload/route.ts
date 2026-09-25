import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createResumableSession, queryUploadStatus, uploadChunk } from "@/lib/drive/google";

/**
 * Upload tệp ghi âm lên Google Drive qua phiên resumable, từng khối <= 4 MiB (dưới giới hạn 4,5 MB
 * của Vercel Functions). Tệp gốc được lưu NGUYÊN VẸN, không nén lại.
 *   POST  → khởi tạo/tiếp tục phiên, trả về offset hiện tại
 *   PUT   ?offset=N  → gửi một khối (body = bytes)
 */
export const maxDuration = 60;
const CHUNK_SIZE = 4 * 1024 * 1024; // bội số của 256 KiB

type Ctx = { params: Promise<{ id: string }> };

async function loadEditable(id: string) {
  const { supabase, user } = await requireApiUser();
  const { data: recording } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!recording) throw new HttpError(404, "Không tìm thấy bản ghi");
  if (recording.owner_id !== user.id) throw new HttpError(403, "Chỉ người tạo bản ghi được tải tệp lên");
  return { recording, user };
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { recording } = await loadEditable(id);
    const body = (await request.json()) as { filename: string; mimeType: string; size: number };
    if (!body.size || body.size <= 0) throw new HttpError(400, "Kích thước tệp không hợp lệ");
    if (body.size > 2 * 1024 ** 3) throw new HttpError(400, "Tệp quá lớn (tối đa 2 GB)");
    const admin = createAdminClient();

    if (recording.upload_status === "uploaded" && recording.drive_file_id) {
      return Response.json({ done: true, offset: body.size, chunkSize: CHUNK_SIZE });
    }

    // Tiếp tục phiên cũ nếu cùng kích thước
    const { data: existing } = await admin.from("upload_sessions").select("*").eq("recording_id", id).maybeSingle();
    if (existing && Number(existing.total_bytes) === body.size) {
      try {
        const status = await queryUploadStatus(existing.session_uri, body.size);
        if (status.done) {
          await finishUpload(id, status.file, body);
          return Response.json({ done: true, offset: body.size, chunkSize: CHUNK_SIZE });
        }
        return Response.json({ done: false, offset: status.nextOffset, chunkSize: CHUNK_SIZE });
      } catch {
        // phiên hết hạn → tạo mới
      }
    }

    const ext = body.filename.includes(".") ? body.filename.slice(body.filename.lastIndexOf(".")) : "";
    const safeTitle = recording.title.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80).trim();
    const datePart = recording.meeting_date ?? new Date().toISOString().slice(0, 10);
    const sessionUri = await createResumableSession({
      name: `${datePart} - ${safeTitle}${ext}`,
      mimeType: body.mimeType || "application/octet-stream",
      size: body.size,
      description: `MeetingAI • ${recording.title} • tệp gốc: ${body.filename}`,
      appProperties: { meetingai_recording_id: id },
    });
    await admin.from("upload_sessions").upsert({ recording_id: id, session_uri: sessionUri, total_bytes: body.size });
    await admin
      .from("recordings")
      .update({
        upload_status: "uploading",
        original_filename: body.filename,
        mime_type: body.mimeType,
        size_bytes: body.size,
      })
      .eq("id", id);
    return Response.json({ done: false, offset: 0, chunkSize: CHUNK_SIZE });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await loadEditable(id);
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? "NaN");
    if (!Number.isFinite(offset) || offset < 0) throw new HttpError(400, "offset không hợp lệ");
    const admin = createAdminClient();
    const { data: session } = await admin.from("upload_sessions").select("*").eq("recording_id", id).maybeSingle();
    if (!session) throw new HttpError(409, "Chưa khởi tạo phiên upload");
    const data = await request.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > CHUNK_SIZE) throw new HttpError(400, "Kích thước khối không hợp lệ");
    const total = Number(session.total_bytes);
    const isLast = offset + data.byteLength === total;
    if (!isLast && data.byteLength % (256 * 1024) !== 0) throw new HttpError(400, "Khối phải là bội số 256 KiB");

    const result = await uploadChunk(session.session_uri, data, offset, total);
    if (result.done) {
      const { data: rec } = await admin.from("recordings").select("original_filename,mime_type").eq("id", id).single();
      await finishUpload(id, result.file, { filename: rec?.original_filename ?? "", mimeType: rec?.mime_type ?? "", size: total });
      return Response.json({ done: true, offset: total });
    }
    return Response.json({ done: false, offset: result.nextOffset });
  } catch (err) {
    return jsonError(err);
  }
}

async function finishUpload(
  id: string,
  file: { id: string; mimeType?: string; size?: string },
  meta: { filename: string; mimeType: string; size: number },
) {
  const admin = createAdminClient();
  await admin
    .from("recordings")
    .update({
      drive_file_id: file.id,
      upload_status: "uploaded",
      mime_type: meta.mimeType || file.mimeType || null,
      size_bytes: Number(file.size ?? meta.size),
    })
    .eq("id", id);
  await admin.from("upload_sessions").delete().eq("recording_id", id);
}
