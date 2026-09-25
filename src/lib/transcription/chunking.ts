import type { ChunkPlan, Interval } from "./types";

export interface ChunkingOptions {
  /** Độ dài mục tiêu mỗi đoạn (giây). */
  targetSec: number;
  /** Tìm điểm lặng trong khoảng ±searchSec quanh điểm cắt mục tiêu. */
  searchSec: number;
  /** Khoảng lặng tối thiểu để được chọn làm điểm cắt (giây). */
  minSilenceSec: number;
  /** Chồng lấn khi buộc phải cắt giữa lời nói (không có khoảng lặng phù hợp). */
  fallbackOverlapSec: number;
  /** Không tạo đoạn cuối ngắn hơn ngưỡng này — gộp vào đoạn trước. */
  minTailSec: number;
}

export const DEFAULT_CHUNKING: ChunkingOptions = {
  targetSec: 600,
  searchSec: 90,
  minSilenceSec: 0.6,
  fallbackOverlapSec: 8,
  minTailSec: 120,
};

/**
 * Lập kế hoạch chia audio thành các đoạn ~targetSec, ưu tiên cắt ở GIỮA khoảng lặng dài nhất
 * gần điểm mục tiêu để không cắt ngang câu nói (không mất chữ ở biên).
 * Nếu không có khoảng lặng phù hợp: cắt cứng và chồng lấn fallbackOverlapSec giây.
 */
export function planChunks(
  durationSec: number,
  silences: Interval[],
  options: Partial<ChunkingOptions> = {},
): ChunkPlan[] {
  const o = { ...DEFAULT_CHUNKING, ...options };
  if (!(durationSec > 0)) return [];
  if (durationSec <= o.targetSec + o.minTailSec) {
    return [{ idx: 0, start: 0, end: durationSec, overlapBefore: 0 }];
  }

  const candidates = silences
    .filter((s) => s.end - s.start >= o.minSilenceSec)
    .sort((a, b) => a.start - b.start);

  const plans: ChunkPlan[] = [];
  let start = 0;
  let overlapBefore = 0;

  while (durationSec - start > o.targetSec + o.minTailSec) {
    const target = start + o.targetSec;
    const lo = target - o.searchSec;
    const hi = target + o.searchSec;
    // Khoảng lặng có trung điểm nằm trong cửa sổ tìm kiếm; ưu tiên dài, rồi gần mục tiêu
    let best: { cut: number; score: number } | null = null;
    for (const s of candidates) {
      const mid = (s.start + s.end) / 2;
      if (mid <= start + 30 || mid < lo || mid > hi) continue;
      const len = Math.min(s.end - s.start, 5);
      const distPenalty = Math.abs(mid - target) / o.searchSec; // 0..1
      const score = len - distPenalty * 1.5;
      if (!best || score > best.score) best = { cut: mid, score };
    }

    if (best) {
      plans.push({ idx: plans.length, start, end: best.cut, overlapBefore });
      start = best.cut;
      overlapBefore = 0;
    } else {
      const cut = target;
      plans.push({ idx: plans.length, start, end: cut, overlapBefore });
      start = cut - o.fallbackOverlapSec;
      overlapBefore = o.fallbackOverlapSec;
    }
  }
  plans.push({ idx: plans.length, start, end: durationSec, overlapBefore });
  return plans.map((p) => ({
    ...p,
    start: round3(p.start),
    end: round3(p.end),
  }));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
