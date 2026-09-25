import { parseTimecode } from "./timecode";
import { isNearDuplicate, tokens } from "./similarity";
import { normalizeSpeakerId } from "./speakers";
import type { ChunkPlan, Interval, RawChunkResult, Segment, SegmentFlag } from "./types";

/** Ước lượng thời lượng đọc một câu tiếng Việt (~3 âm tiết/giây). */
export function estimateSpeechSeconds(text: string): number {
  const n = tokens(text).length;
  return Math.min(30, Math.max(1, n / 3));
}

type Draft = Omit<Segment, "id">;

/**
 * Chuyển kết quả thô của một đoạn (thời gian tương đối) sang thời gian tuyệt đối.
 * Thứ tự phát ra của mô hình được coi là thứ tự đúng; thời gian được ép đơn điệu tăng.
 * Nếu mốc thời gian vượt quá độ dài đoạn (trôi thời gian), co giãn lại cho khớp.
 */
export function toAbsoluteSegments(
  plan: ChunkPlan,
  result: RawChunkResult,
  speakerMap?: (localId: string) => string,
): Draft[] {
  const chunkLen = plan.end - plan.start;
  const drafts: Draft[] = [];
  let prevStart = 0;
  let prevEnd = 0;

  for (const raw of result.segments ?? []) {
    const text = (raw.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Câu chỉ có chú thích tiếng động / [không nghe rõ]: bỏ — không tạo người nói ảo (vd "Người nói 0")
    if (!text.replace(/\[[^\]]*\]/g, "").replace(/[\s.,;:!?…-]+/g, "")) continue;
    let s = parseTimecode(raw.start);
    let e = parseTimecode(raw.end);
    if (!Number.isFinite(s)) s = prevEnd;
    if (!Number.isFinite(e) || e <= s) e = s + estimateSpeechSeconds(text);
    // Ép đơn điệu: không cho câu sau bắt đầu trước câu trước
    if (s < prevStart) s = prevStart;
    if (e < s + 0.2) e = s + 0.2;
    prevStart = s;
    prevEnd = e;
    const local = normalizeSpeakerId(raw.speaker);
    const flags: SegmentFlag[] = [];
    if (/\[(\?|không nghe rõ|khong nghe ro|inaudible)\]/i.test(text)) flags.push("uncertain");
    drafts.push({
      start: s,
      end: e,
      speaker: speakerMap ? speakerMap(local) : local,
      text,
      ...(flags.length ? { flags } : {}),
    });
  }

  // Co giãn nếu mốc thời gian vượt quá độ dài đoạn > 5%
  const maxEnd = drafts.reduce((m, d) => Math.max(m, d.end), 0);
  const scale = maxEnd > chunkLen * 1.05 && maxEnd > 0 ? chunkLen / maxEnd : 1;

  return drafts.map((d) => ({
    ...d,
    start: round2(plan.start + Math.min(d.start * scale, chunkLen)),
    end: round2(plan.start + Math.min(d.end * scale, chunkLen)),
  }));
}

/**
 * Loại các câu ở đầu đoạn sau bị trùng với phần cuối đoạn trước (chỉ khi cắt cứng có chồng lấn).
 * Giữ bản dài/đầy đủ hơn.
 */
export function dedupeOverlap(
  previous: Draft[],
  next: Draft[],
  overlap: Interval,
): { kept: Draft[]; removed: number } {
  if (overlap.end <= overlap.start) return { kept: next, removed: 0 };
  const tail = previous.filter((p) => p.end >= overlap.start - 10);
  let removed = 0;
  const kept: Draft[] = [];
  for (const seg of next) {
    const inOverlap = seg.start <= overlap.end + 2;
    if (inOverlap) {
      const dupIdx = tail.findIndex((p) => isNearDuplicate(p.text, seg.text));
      if (dupIdx >= 0) {
        const p = tail[dupIdx];
        // Nếu bản mới dài hơn rõ rệt (bản cũ bị cắt giữa câu) thì thay thế bản cũ
        if (tokens(seg.text).length > tokens(p.text).length * 1.2) {
          p.text = seg.text;
          p.end = Math.max(p.end, seg.end);
        }
        removed++;
        continue;
      }
    }
    kept.push(seg);
  }
  return { kept, removed };
}

/**
 * Cắt vòng lặp (lỗi hay gặp của mô hình sinh): nhiều câu liên tiếp gần như giống hệt nhau,
 * hoặc một cụm từ lặp lại liên tục trong cùng một câu.
 */
export function collapseRepetitions(segments: Draft[]): { segments: Draft[]; trimmed: number } {
  const out: Draft[] = [];
  let trimmed = 0;
  let runCount = 0;
  for (const seg of segments) {
    const text = collapseInlineLoops(seg.text);
    const inlineTrimmed = text !== seg.text;
    const current: Draft = inlineTrimmed
      ? { ...seg, text, flags: addFlag(seg.flags, "repetition_trimmed") }
      : seg;
    if (inlineTrimmed) trimmed++;

    const last = out[out.length - 1];
    if (
      last &&
      last.speaker === current.speaker &&
      tokens(current.text).length >= 3 &&
      isNearDuplicate(last.text, current.text) &&
      tokens(last.text).length === tokens(current.text).length
    ) {
      runCount++;
      // Cho phép lặp lại 1 lần (người nói nhắc lại), từ lần thứ 3 coi là vòng lặp
      if (runCount >= 2) {
        last.end = Math.max(last.end, current.end);
        last.flags = addFlag(last.flags, "repetition_trimmed");
        trimmed++;
        continue;
      }
    } else {
      runCount = 0;
    }
    out.push(current);
  }
  return { segments: out, trimmed };
}

/** "a b c a b c a b c a b c" -> "a b c" khi cụm (1..12 từ) lặp > 3 lần liên tiếp. */
export function collapseInlineLoops(text: string): string {
  const words = text.split(/\s+/);
  if (words.length < 8) return text;
  for (let n = 1; n <= 12; n++) {
    let i = 0;
    const out: string[] = [];
    let changed = false;
    while (i < words.length) {
      const unit = words.slice(i, i + n);
      let reps = 1;
      while (
        i + (reps + 1) * n <= words.length &&
        words.slice(i + reps * n, i + (reps + 1) * n).join(" ").toLowerCase() === unit.join(" ").toLowerCase()
      ) {
        reps++;
      }
      if (reps > 3 && unit.length === n) {
        out.push(...unit);
        i += reps * n;
        changed = true;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    if (changed) return collapseInlineLoops(out.join(" "));
  }
  return text;
}

function addFlag(flags: SegmentFlag[] | undefined, f: SegmentFlag): SegmentFlag[] {
  return flags?.includes(f) ? flags : [...(flags ?? []), f];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface ChunkOutput {
  plan: ChunkPlan;
  result: RawChunkResult;
}

/** Ghép kết quả các đoạn theo thứ tự, xử lý chồng lấn và vòng lặp. */
export function mergeChunkOutputs(
  outputs: ChunkOutput[],
  speakerMapFor?: (chunkIdx: number) => (localId: string) => string,
): { segments: Segment[]; duplicatesRemoved: number; repetitionsTrimmed: number } {
  const sorted = [...outputs].sort((a, b) => a.plan.idx - b.plan.idx);
  let all: Draft[] = [];
  let duplicatesRemoved = 0;
  for (const out of sorted) {
    let drafts = toAbsoluteSegments(out.plan, out.result, speakerMapFor?.(out.plan.idx));
    if (out.plan.overlapBefore > 0 && all.length > 0) {
      const { kept, removed } = dedupeOverlap(all, drafts, {
        start: out.plan.start,
        end: out.plan.start + out.plan.overlapBefore,
      });
      drafts = kept;
      duplicatesRemoved += removed;
    }
    all = all.concat(drafts);
  }
  const { segments, trimmed } = collapseRepetitions(all);
  return { segments: assignIds(segments), duplicatesRemoved, repetitionsTrimmed: trimmed };
}

export function assignIds(drafts: Draft[]): Segment[] {
  return drafts.map((d, i) => ({ ...d, id: `s${String(i + 1).padStart(4, "0")}` }));
}

/** Hợp nhất danh sách khoảng (đã sắp xếp hoặc chưa), nối các khoảng cách nhau <= joinGap. */
export function unionIntervals(intervals: Interval[], joinGap = 0): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end + joinGap) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** a \ b (các phần của a không nằm trong b). */
export function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
  const bs = unionIntervals(b);
  const out: Interval[] = [];
  for (const iv of unionIntervals(a)) {
    let cursor = iv.start;
    for (const cut of bs) {
      if (cut.end <= cursor) continue;
      if (cut.start >= iv.end) break;
      if (cut.start > cursor) out.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= iv.end) break;
    }
    if (cursor < iv.end) out.push({ start: cursor, end: iv.end });
  }
  return out;
}

/**
 * Tính độ phủ: phần thời gian có tiếng nói (theo phát hiện khoảng lặng) đã có câu phiên âm.
 * Trả về các khoảng trống >= minGapSec — nghi ngờ bị mô hình bỏ sót.
 */
export function computeCoverage(
  segments: Pick<Segment, "start" | "end">[],
  speech: Interval[],
  opts: { padSec?: number; minGapSec?: number; joinSec?: number } = {},
): { speechSec: number; coveredSec: number; ratio: number; gaps: Interval[] } {
  const pad = opts.padSec ?? 1.5;
  const minGap = opts.minGapSec ?? 15;
  const join = opts.joinSec ?? 3;
  const covered = unionIntervals(segments.map((s) => ({ start: s.start - pad, end: s.end + pad })));
  const speechU = unionIntervals(speech);
  const speechSec = speechU.reduce((a, i) => a + (i.end - i.start), 0);
  const uncovered = unionIntervals(subtractIntervals(speechU, covered), join);
  const uncoveredSec = subtractIntervals(speechU, covered).reduce((a, i) => a + (i.end - i.start), 0);
  const gaps = uncovered
    .filter((g) => g.end - g.start >= minGap)
    .map((g) => ({ start: round2(g.start), end: round2(g.end) }));
  const coveredSec = Math.max(0, speechSec - uncoveredSec);
  return { speechSec, coveredSec, ratio: speechSec > 0 ? coveredSec / speechSec : 1, gaps };
}

/**
 * Chèn các câu tìm lại được từ lượt quét khoảng trống vào transcript.
 * Bỏ các câu trùng với câu đã có trong ±45 giây (tránh nhân đôi nội dung khi mốc thời gian lệch).
 */
export function mergeGapSegments(
  base: Segment[],
  gapSegments: Draft[],
  gap: Interval,
): { segments: Segment[]; added: number } {
  const candidates = gapSegments.filter((g) => g.end >= gap.start - 3 && g.start <= gap.end + 3);
  const additions: Draft[] = [];
  for (const g of candidates) {
    const nearby = base.filter((b) => Math.abs(b.start - g.start) <= 45);
    if (nearby.some((b) => isNearDuplicate(b.text, g.text))) continue;
    if (additions.some((a) => isNearDuplicate(a.text, g.text))) continue;
    additions.push({ ...g, flags: addFlag(g.flags, "gap_fill") });
  }
  if (additions.length === 0) return { segments: base, added: 0 };
  const merged = [...base.map(({ id: _id, ...rest }) => rest), ...additions].sort(
    (a, b) => a.start - b.start,
  );
  return { segments: assignIds(merged), added: additions.length };
}

/** Thời lượng nói của từng người (giây) — dùng để bầu tên người nói. */
export function talkTimeBySpeaker(segments: Pick<Segment, "speaker" | "start" | "end">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of segments) out[s.speaker] = (out[s.speaker] ?? 0) + Math.max(0, s.end - s.start);
  return out;
}
