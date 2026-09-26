/**
 * Chuyển đổi mã thời gian. Chấp nhận: 75, "75", "75.5", "01:15", "1:15.250", "00:01:15", "1:02:03.5".
 * Trả về NaN nếu không hợp lệ.
 */
export function parseTimecode(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const s = value.trim().replace(",", ".");
  if (s === "") return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return NaN;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseFloat(m[3]);
  if (sec >= 60 || (m[1] !== undefined && min >= 60)) {
    // "75:30" (phút > 59 khi không có giờ) vẫn hợp lệ; nhưng giây >= 60 thì không
    if (sec >= 60) return NaN;
  }
  return h * 3600 + min * 60 + sec;
}

/** 75.4 -> "01:15"; 3725 -> "1:02:05" */
export function formatTimecode(totalSeconds: number, opts: { forceHours?: boolean } = {}): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const t = Math.floor(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0 || opts.forceHours) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** Định dạng SRT: 00:01:15,400 */
export function formatSrtTime(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

/** Định dạng thời lượng thân thiện: 2403 -> "40 phút 3 giây" */
export function formatDuration(totalSeconds?: number | null): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds)) return "—";
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  if (m > 0) return s > 0 && m < 10 ? `${m} phút ${s} giây` : `${m} phút`;
  return `${s} giây`;
}
