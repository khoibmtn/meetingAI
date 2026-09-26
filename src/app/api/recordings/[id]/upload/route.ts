import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createResumableSession, isDriveConfigured, queryUploadStatus, uploadChunk } from "@/lib/drive/google";
import { TEMP_AUDIO_MAX_BYTES } from "@/lib/audio/limits";
import { listTempParts, putTempPart, removeTempAudio, TEMP_SESSION, tempBytesStored } from "@/lib/storage/temp-audio";
import { orderedParts } from "@/lib/storage/temp-parts";

/**
 * Upload tệp ghi âm theo từng khối <= 4 MiB (dưới giới hạn 4,5 MB của Vercel Functions).
 *   target "drive" (mặc định): lên Google Drive qua phiên resumable — tệp gốc lưu NGUYÊN VẸN.
 *   target "temp": giữ tạm trong Supabase Storage chỉ để phiên âm, xoá khi phiên âm xong
 *                  (dùng khi chưa kết nối hoặc không tải được lên Drive).
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
    const body = (await request.json()) as { filename: string; mimeType: string; size: number; target?: string };
    if (!body.size || body.size <= 0) throw new HttpError(400, "Kích thước tệp không hợp lệ");
    if (body.size > 2 * 1024 ** 3) throw new HttpError(400, "Tệp quá lớn (tối đa 2 GB)");
    const admin = createAdminClient();

    if (recording.upload_status === "uploaded" && recording.drive_file_id) {
      return Response.json({ done: true, offset: body.size, chunkSize: CHUNK_SIZE });
    }

    const { data: existing } = await admin.from("upload_sessions").select("*").eq("recording_id", id).maybeSingle();
    if (body.target === "temp") return Response.json(await startTempUpload(recording, body, existing));
    if (!(await isDriveConfigured())) throw new HttpError(409, "Chưa kết nối Google Drive");

    // Tiếp tục phiên cũ nếu cùng kích thước
    if (existing && existing.session_uri !== TEMP_SESSION && Number(existing.total_bytes) === body.size) {
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
    if (offset + data.byteLength > total) throw new HttpError(400, "Khối vượt quá kích thước tệp");
    if (session.session_uri === TEMP_SESSION) return Response.json(await putTempChunk(id, offset, data, total));
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
  // Đã có tệp gốc trên Drive → tệp tạm (nếu có) không còn cần
  await removeTempAudio(id).catch((e) => console.error("remove temp audio", e));
}

// ---------------------------------------------------------------------------
// Tệp tạm (không lưu lên Drive)
// ---------------------------------------------------------------------------

type Meta = { filename: string; mimeType: string; size: number };

async function startTempUpload(
  recording: { id: string; upload_status: string },
  body: Meta,
  existing: { session_uri: string; total_bytes: number } | null,
) {
  const id = recording.id;
  if (body.size > TEMP_AUDIO_MAX_BYTES) {
    throw new HttpError(400, `Tệp lớn hơn ${TEMP_AUDIO_MAX_BYTES / 1024 / 1024} MB — cần kết nối Google Drive để lưu và phiên âm tệp này`);
  }
  const admin = createAdminClient();
  if (recording.upload_status === "temporary") {
    const { count } = await admin
      .from("transcription_jobs")
      .select("id", { count: "exact", head: true })
      .eq("recording_id", id)
      .in("status", ["queued", "preparing", "transcribing", "finalizing"]);
    if (count) throw new HttpError(409, "Bản ghi đang được phiên âm bằng tệp tạm — chờ xong rồi hãy tải tệp khác");
  }
  // Tiếp tục phiên tạm cũ (cùng kích thước): hỏi Storage đã nhận liền mạch tới đâu
  if (existing?.session_uri === TEMP_SESSION && Number(existing.total_bytes) === body.size) {
    const stored = await tempBytesStored(id);
    if (stored >= body.size && (await finishTemp(id, body))) return { done: true, offset: body.size, chunkSize: CHUNK_SIZE };
    return { done: false, offset: Math.min(stored, body.size), chunkSize: CHUNK_SIZE };
  }
  await removeTempAudio(id); // bỏ phần của tệp khác (nếu có)
  await admin.from("upload_sessions").upsert({ recording_id: id, session_uri: TEMP_SESSION, total_bytes: body.size });
  await admin
    .from("recordings")
    .update({ upload_status: "uploading", original_filename: body.filename, mime_type: body.mimeType, size_bytes: body.size })
    .eq("id", id);
  return { done: false, offset: 0, chunkSize: CHUNK_SIZE };
}

async function putTempChunk(id: string, offset: number, data: ArrayBuffer, total: number) {
  await putTempPart(id, offset, data);
  const next = offset + data.byteLength;
  if (next < total) return { done: false, offset: next };
  // Khối cuối: kiểm tra đủ phần liền mạch rồi mới coi là xong (thiếu thì báo vị trí cần gửi lại)
  const { data: rec } = await createAdminClient().from("recordings").select("original_filename,mime_type").eq("id", id).single();
  if (await finishTemp(id, { filename: rec?.original_filename ?? "", mimeType: rec?.mime_type ?? "", size: total })) {
    return { done: true, offset: total };
  }
  return { done: false, offset: await tempBytesStored(id) };
}

async function finishTemp(id: string, meta: Meta): Promise<boolean> {
  if (!orderedParts(await listTempParts(id), meta.size)) return false;
  const admin = createAdminClient();
  await admin
    .from("recordings")
    .update({ upload_status: "temporary", original_filename: meta.filename || null, mime_type: meta.mimeType || null, size_bytes: meta.size })
    .eq("id", id);
  await admin.from("upload_sessions").delete().eq("recording_id", id);
  return true;
}
