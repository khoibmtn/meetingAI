import type { Interval } from "./types";

/**
 * Phân tích stderr của ffmpeg `silencedetect`:
 *   [silencedetect @ 0x..] silence_start: 12.345
 *   [silencedetect @ 0x..] silence_end: 14.002 | silence_duration: 1.657
 */
export function parseSilenceDetect(stderr: string, durationSec: number): Interval[] {
  const silences: Interval[] = [];
  let currentStart: number | null = null;
  const re = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const t = Math.max(0, parseFloat(m[2]));
    if (m[1] === "start") {
      currentStart = t;
    } else if (currentStart !== null) {
      if (t > currentStart) silences.push({ start: currentStart, end: Math.min(t, durationSec) });
      currentStart = null;
    }
  }
  // Im lặng kéo dài tới hết tệp (không có silence_end)
  if (currentStart !== null && durationSec > currentStart) {
    silences.push({ start: currentStart, end: durationSec });
  }
  return silences;
}

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

/** Tìm thời lượng từ stderr ffmpeg: "Duration: 00:40:03.54" */
export function parseFfmpegDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

export function totalLength(intervals: Interval[]): number {
  return intervals.reduce((acc, i) => acc + Math.max(0, i.end - i.start), 0);
}
