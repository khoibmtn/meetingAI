import { isNearDuplicate, tokens } from "./similarity";
import type { Speaker } from "./types";

/**
 * Giọng mẫu: một đoạn ngắn chỉ có MỘT người nói, cắt từ tệp gốc và tải lên Gemini, gửi kèm các đoạn
 * phiên âm sau để mô hình so bằng giọng thật (không chỉ dựa vào mô tả bằng chữ) → gán đúng ID người nói
 * giữa các đoạn.
 */
export interface VoiceRef {
  key: string;
  /** Mốc tuyệt đối (giây) của đoạn mẫu trong bản ghi. */
  start: number;
  end: number;
  /** Lời nói trong đoạn mẫu — để lọc nếu mô hình lỡ phiên âm cả giọng mẫu. */
  text: string;
  uri: string;
  fileName: string;
  mimeType: string;
}

/** Số giọng mẫu tối đa gửi kèm một đoạn (ưu tiên người nói nhiều). */
export const MAX_VOICE_REFS = 8;
/** Người nói phải nói ít nhất chừng này giây thì mới lấy giọng mẫu. */
export const MIN_TALK_SEC_FOR_REF = 4;
const MIN_CLIP_SEC = 3.5;
const MAX_CLIP_SEC = 12;
const TRIM_START_SEC = 0.25;
const TRIM_END_SEC = 0.2;

interface Seg {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

const UNCLEAR = /\[(\?|không nghe rõ|khong nghe ro|inaudible|nhiều người|nhieu nguoi)/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Chọn đoạn làm giọng mẫu cho từng khoá người nói: chỉ một người nói (không chồng lấn câu của người khác),
 * đủ dài, đủ chữ, không có chỗ nghe không rõ; ưu tiên câu dài ~10 giây. Khoảng cắt được thu hẹp ở hai mép
 * để tránh lẫn giọng người bên cạnh (mốc thời gian của mô hình chỉ gần đúng).
 */
export function pickVoiceRefSegments(
  segments: Seg[],
  keys: string[],
): Map<string, { start: number; end: number; text: string }> {
  const wanted = new Set(keys);
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const best = new Map<string, { score: number; start: number; end: number; text: string }>();
  sorted.forEach((s, i) => {
    if (!wanted.has(s.speaker) || UNCLEAR.test(s.text)) return;
    const dur = s.end - s.start;
    if (dur > 40) return; // câu quá dài: mốc thời gian dễ lệch
    const words = tokens(s.text).length;
    if (words < 6) return;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    if (prev && prev.speaker !== s.speaker && prev.end > s.start + 0.1) return;
    if (next && next.speaker !== s.speaker && next.start < s.end - 0.1) return;
    const start = s.start + TRIM_START_SEC;
    const end = Math.min(s.end - TRIM_END_SEC, start + MAX_CLIP_SEC);
    if (end - start < MIN_CLIP_SEC) return;
    const score = -Math.abs(Math.min(dur, 16) - 10) + Math.min(words, 40) / 40;
    const cur = best.get(s.speaker);
    if (!cur || score > cur.score) best.set(s.speaker, { score, start: round2(start), end: round2(end), text: s.text });
  });
  return new Map([...best].map(([k, v]) => [k, { start: v.start, end: v.end, text: v.text }]));
}

/** Nhãn đi kèm giọng mẫu, vd "S1 — Thầy (Chủ tọa)". */
export function voiceRefLabel(s: Pick<Speaker, "key" | "name" | "role">): string {
  const name = s.name && !/^Người nói/i.test(s.name) ? s.name : null;
  const who = [name, s.role ? `(${s.role})` : null].filter(Boolean).join(" ");
  return `${s.key} — ${who || "chưa rõ tên"}`;
}

/**
 * Bỏ câu mà mô hình lỡ phiên âm từ chính giọng mẫu (trùng lời của đoạn mẫu). Giọng mẫu luôn lấy từ
 * các đoạn TRƯỚC nên câu trùng không thể là lời thật của đoạn đang phiên âm (trừ vùng chồng lấn,
 * nơi đoạn trước vẫn giữ câu đó).
 */
export function dropVoiceRefEchoes<T extends { text: string }>(
  segments: T[],
  refTexts: string[],
): { kept: T[]; dropped: number } {
  if (!refTexts.length) return { kept: segments, dropped: 0 };
  let dropped = 0;
  const kept = segments.filter((s) => {
    if (tokens(s.text).length < 5) return true;
    const echo = refTexts.some((t) => isNearDuplicate(t, s.text));
    if (echo) dropped++;
    return !echo;
  });
  return { kept, dropped };
}
