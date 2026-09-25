/** Một câu/đoạn lời nói trong transcript (thời gian tính bằng giây, tuyệt đối trong bản ghi). */
export interface Segment {
  id: string;
  start: number;
  end: number;
  speaker: string; // khoá người nói, ví dụ "S1"
  text: string;
  flags?: SegmentFlag[];
}

export type SegmentFlag =
  | "uncertain" // có đoạn nghe không rõ
  | "gap_fill" // bổ sung từ lượt quét khoảng trống
  | "repetition_trimmed" // đã cắt vòng lặp lặp lại
  | "term_corrected" // AI đã sửa thuật ngữ (có kiểm chứng)
  | "edited"; // người dùng đã hiệu đính

export interface Speaker {
  key: string;
  name: string;
  role?: string | null;
  description?: string | null;
}

/** Khoảng thời gian [start, end) tính bằng giây. */
export interface Interval {
  start: number;
  end: number;
}

export interface ChunkPlan {
  idx: number;
  start: number;
  end: number;
  /** Số giây chồng lấn với đoạn trước (0 nếu cắt đúng khoảng lặng). */
  overlapBefore: number;
}

/** Kết quả thô mô hình trả về cho một đoạn audio (thời gian tương đối trong đoạn). */
export interface RawChunkSegment {
  start: number | string;
  end: number | string;
  speaker: string;
  text: string;
}

export interface RawChunkSpeaker {
  id: string;
  name?: string | null;
  role?: string | null;
  description?: string | null;
}

export interface RawChunkResult {
  segments: RawChunkSegment[];
  speakers: RawChunkSpeaker[];
  truncated?: boolean;
}

export interface TranscriptQuality {
  durationSec: number;
  speechSec: number;
  coveredSpeechSec: number;
  coverageRatio: number; // 0..1
  uncoveredGaps: Interval[];
  gapFillsAttempted: number;
  gapFillsRecovered: number;
  repetitionsTrimmed: number;
  duplicatesRemoved: number;
  warnings: string[];
}
