import "server-only";
import { open } from "node:fs/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { contiguousBytes, orderedParts, parsePart, partName, type StoredPart } from "./temp-parts";

/**
 * Tệp ghi âm giữ TẠM để phiên âm khi không lưu lên Google Drive: Supabase Storage (bucket riêng tư),
 * chia phần 4 MiB — dưới giới hạn 50 MB/tệp của gói Free. Chỉ máy chủ (service role) truy cập.
 */
export const TEMP_AUDIO_BUCKET = "audio-temp";
/** Đánh dấu phiên tải lên tạm trong bảng upload_sessions (phiên Drive lưu URI thật). */
export const TEMP_SESSION = "temp";

const bucket = () => createAdminClient().storage.from(TEMP_AUDIO_BUCKET);

export async function listTempParts(recordingId: string): Promise<StoredPart[]> {
  const { data, error } = await bucket().list(recordingId, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Không đọc được tệp tạm: ${error.message}`);
  return (data ?? []).flatMap((o) => parsePart(o.name, Number(o.metadata?.size ?? 0)) ?? []);
}

export async function tempBytesStored(recordingId: string): Promise<number> {
  return contiguousBytes(await listTempParts(recordingId));
}

export async function putTempPart(recordingId: string, offset: number, data: ArrayBuffer): Promise<void> {
  const { error } = await bucket().upload(`${recordingId}/${partName(offset)}`, Buffer.from(data), {
    upsert: true,
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(`Không lưu được tệp tạm: ${error.message}`);
}

/** Ghép các phần thành tệp cục bộ cho ffmpeg; báo lỗi rõ khi tệp tạm đã bị xoá hoặc thiếu phần. */
export async function downloadTempAudio(recordingId: string, dest: string, expectedSize: number): Promise<void> {
  const parts = await listTempParts(recordingId);
  if (!parts.length) throw new Error("Tệp tạm không còn (đã hết hạn hoặc đã xoá) — hãy tải tệp ghi âm lên lại.");
  const ordered = orderedParts(parts, expectedSize || contiguousBytes(parts));
  if (!ordered) throw new Error("Tệp tạm chưa đầy đủ — hãy tải tệp ghi âm lên lại.");
  const fh = await open(dest, "w");
  try {
    for (const p of ordered) {
      const { data, error } = await bucket().download(`${recordingId}/${p.name}`);
      if (error || !data) throw new Error(`Không đọc được tệp tạm: ${error?.message ?? "không có dữ liệu"}`);
      await fh.write(Buffer.from(await data.arrayBuffer()));
    }
  } finally {
    await fh.close();
  }
}

export async function removeTempAudio(recordingId: string): Promise<void> {
  const parts = await listTempParts(recordingId);
  if (!parts.length) return;
  const { error } = await bucket().remove(parts.map((p) => `${recordingId}/${p.name}`));
  if (error) throw new Error(`Không xoá được tệp tạm: ${error.message}`);
}

/**
 * Xoá tệp tạm (phiên âm xong hoặc quá hạn) và đánh dấu bản ghi "không lưu tệp".
 * Bỏ qua nếu bản ghi còn tác vụ phiên âm khác đang chạy (tác vụ đó còn cần tệp).
 */
export async function discardTempAudio(recordingId: string, exceptJobId?: string): Promise<boolean> {
  const admin = createAdminClient();
  let active = admin
    .from("transcription_jobs")
    .select("id", { count: "exact", head: true })
    .eq("recording_id", recordingId)
    .in("status", ["queued", "preparing", "transcribing", "finalizing"]);
  if (exceptJobId) active = active.neq("id", exceptJobId);
  const { count } = await active;
  if (count) return false;
  await removeTempAudio(recordingId);
  await admin.from("recordings").update({ upload_status: "discarded" }).eq("id", recordingId).eq("upload_status", "temporary");
  await admin.from("upload_sessions").delete().eq("recording_id", recordingId).eq("session_uri", TEMP_SESSION);
  return true;
}
