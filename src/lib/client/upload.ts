"use client";

import { apiJson } from "./api";

export interface UploadProgress {
  loaded: number;
  total: number;
  speedBps: number;
}

/** Nơi nhận tệp: Google Drive (lưu lâu dài) hoặc tạm — chỉ để phiên âm, xoá khi xong. */
export type UploadTarget = "drive" | "temp";

/**
 * Tải tệp lên qua API (resumable, từng khối 4 MiB). Tự thử lại khi lỗi mạng
 * và tiếp tục từ vị trí server báo. Tệp gốc được giữ nguyên vẹn.
 */
export async function uploadRecordingFile(
  recordingId: string,
  file: Blob & { name?: string },
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
  target: UploadTarget = "drive",
): Promise<void> {
  const filename = file.name || `ghi-am-${Date.now()}.webm`;
  const meta = { filename, mimeType: file.type || "application/octet-stream", size: file.size, target };
  const init = await apiJson<{ done: boolean; offset: number; chunkSize: number }>(
    `/api/recordings/${recordingId}/upload`,
    { method: "POST", json: meta },
  );
  let offset = init.offset;
  const chunkSize = init.chunkSize;
  const started = Date.now();
  const startOffset = offset;
  onProgress({ loaded: offset, total: file.size, speedBps: 0 });
  if (init.done) return;

  let failures = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Đã huỷ", "AbortError");
    const end = Math.min(offset + chunkSize, file.size);
    try {
      const res = await apiJson<{ done: boolean; offset: number }>(
        `/api/recordings/${recordingId}/upload?offset=${offset}`,
        { method: "PUT", body: file.slice(offset, end), headers: { "Content-Type": "application/octet-stream" }, signal },
      );
      failures = 0;
      offset = res.done ? file.size : res.offset;
      const elapsed = (Date.now() - started) / 1000;
      onProgress({ loaded: offset, total: file.size, speedBps: elapsed > 0 ? (offset - startOffset) / elapsed : 0 });
      if (res.done) return;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      failures++;
      if (failures > 5) throw err;
      await new Promise((r) => setTimeout(r, 1500 * failures));
      // Hỏi lại vị trí đã nhận được
      const status = await apiJson<{ done: boolean; offset: number }>(`/api/recordings/${recordingId}/upload`, {
        method: "POST",
        json: meta,
      }).catch(() => null);
      if (status?.done) return;
      if (status) offset = status.offset;
    }
  }
}

/** Đọc thời lượng tệp âm thanh trong trình duyệt. */
export function readAudioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) done(audio.duration);
      else {
        // webm từ MediaRecorder: duration = Infinity → tua tới cuối để lấy thời lượng
        audio.currentTime = 1e9;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          done(Number.isFinite(audio.duration) ? audio.duration : null);
        };
      }
    };
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    audio.src = url;
  });
}
