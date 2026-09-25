import type { SegmentFlag } from "./types";

export interface TokenLike {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
  speaker?: string;
  translation_status?: string;
}

interface Draft {
  start: number;
  end: number;
  speaker: string;
  text: string;
  flags?: SegmentFlag[];
}

/**
 * Gom token (mảnh từ, có khoảng trắng đầu) thành các câu theo người nói.
 * Tách câu khi: đổi người nói; khoảng nghỉ > 1,5 s; hoặc gặp dấu kết câu và câu đã dài > 6 s
 * (hoặc sau đó có khoảng nghỉ > 0,6 s); câu quá 30 s thì tách ở ranh giới từ gần nhất.
 */
export function tokensToSegments(tokens: TokenLike[]): Draft[] {
  const out: Draft[] = [];
  let cur: (Draft & { lowConf: number; count: number }) | null = null;
  const words = tokens.filter((t) => t.translation_status !== "translation" && t.text);

  const flush = () => {
    if (!cur) return;
    const text = cur.text.replace(/\s+/g, " ").trim();
    if (text) {
      const flags: SegmentFlag[] = cur.count > 0 && cur.lowConf / cur.count > 0.3 ? ["uncertain"] : [];
      out.push({ start: cur.start, end: cur.end, speaker: cur.speaker, text, ...(flags.length ? { flags } : {}) });
    }
    cur = null;
  };

  for (let i = 0; i < words.length; i++) {
    const t = words[i];
    const speaker = `S${t.speaker ?? "1"}`;
    const start = (t.start_ms ?? 0) / 1000;
    const end = (t.end_ms ?? t.start_ms ?? 0) / 1000;
    if (cur) {
      const pause = start - cur.end;
      const startsWord = /^\s/.test(t.text);
      const endsSentence = /[.?!…]["”)]?\s*$/.test(cur.text);
      const len = cur.end - cur.start;
      if (
        speaker !== cur.speaker ||
        pause > 1.5 ||
        (endsSentence && startsWord && (len > 6 || pause > 0.6)) ||
        (len > 30 && startsWord)
      ) {
        flush();
      }
    }
    if (!cur) {
      cur = { start, end, speaker, text: t.text.trimStart(), lowConf: 0, count: 0 };
    } else {
      cur.text += t.text;
      cur.end = Math.max(cur.end, end);
    }
    cur.count++;
    if (typeof t.confidence === "number" && t.confidence < 0.5) cur.lowConf++;
  }
  flush();
  return out;
}
