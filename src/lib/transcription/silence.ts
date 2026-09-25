import type { Interval } from "./types";

/** Phần bù của các khoảng lặng trong [0, duration] = các khoảng có tiếng. */
export function speechIntervals(silences: Interval[], durationSec: number, minSpeech = 0.3): Interval[] {
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start > cursor && s.start - cursor >= minSpeech) out.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (durationSec > cursor && durationSec - cursor >= minSpeech) out.push({ start: cursor, end: durationSec });
  return out;
}

export function totalLength(intervals: Interval[]): number {
  return intervals.reduce((acc, i) => acc + Math.max(0, i.end - i.start), 0);
}
