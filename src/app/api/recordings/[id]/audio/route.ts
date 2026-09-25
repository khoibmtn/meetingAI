import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchDriveMedia } from "@/lib/drive/google";

/**
 * Phát audio từ Google Drive có kiểm tra quyền (RLS) và hỗ trợ HTTP Range — cần cho tua
 * trên Safari/iOS. Mỗi phản hồi giới hạn ~8 MB để tua nhanh, trình duyệt tự yêu cầu phần tiếp.
 */
export const maxDuration = 60;
const MAX_SLICE = 8 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const { data: recording } = await supabase
    .from("recordings")
    .select("drive_file_id, mime_type, size_bytes, original_filename")
    .eq("id", id)
    .maybeSingle();
  if (!recording?.drive_file_id) return new Response("Không tìm thấy", { status: 404 });

  const size = Number(recording.size_bytes ?? 0);
  const requested = request.headers.get("range");
  let range: string | null = null;
  let start = 0;
  let end = size - 1;
  if (size > 0) {
    const m = requested?.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      if (m[1] === "" && m[2]) {
        const suffix = parseInt(m[2], 10);
        start = Math.max(0, size - suffix);
      } else {
        start = parseInt(m[1] || "0", 10);
        if (m[2]) end = Math.min(parseInt(m[2], 10), size - 1);
      }
    }
    if (start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, start + MAX_SLICE - 1);
    range = `bytes=${start}-${end}`;
  }

  const upstream = await fetchDriveMedia(recording.drive_file_id, range, request.signal).catch(() => null);
  if (!upstream || !upstream.body) return new Response("Không đọc được tệp từ Google Drive", { status: 502 });

  const headers = new Headers({
    "Content-Type": recording.mime_type || upstream.headers.get("content-type") || "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (size > 0) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(upstream.body, { status: 206, headers });
  }
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(upstream.body, { status: 200, headers });
}
