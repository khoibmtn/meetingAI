import { parseTimecode } from "@/lib/transcription/timecode";

/**
 * Chuyển trích dẫn mốc thời gian trong câu trả lời AI thành liên kết nội bộ:
 *   [R1 05:23] → [R1 05:23](#cite-R1-323)
 *   [05:23]    → [05:23](#cite--323)
 * (không đụng tới liên kết Markdown có sẵn "[text](url)")
 */
export function linkifyCitations(md: string): string {
  return md.replace(/\[(?:(R\d{1,3})\s+)?((?:\d{1,2}:)?\d{1,2}:\d{2})\](?!\()/g, (_m, code: string | undefined, tc: string) => {
    const sec = parseTimecode(tc);
    if (!Number.isFinite(sec)) return _m;
    const label = code ? `${code} ${tc}` : tc;
    return `[${label}](#cite-${code ?? ""}-${Math.round(sec)})`;
  });
}

export function parseCiteHref(href: string | undefined): { code: string | null; seconds: number } | null {
  const m = href?.match(/^#cite-(R\d{1,3})?-(\d+)$/);
  if (!m) return null;
  return { code: m[1] ?? null, seconds: parseInt(m[2], 10) };
}
