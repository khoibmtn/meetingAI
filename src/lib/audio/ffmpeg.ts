import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { Interval } from "@/lib/transcription/types";

function binary(): string {
  const p = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!p || (!process.env.FFMPEG_PATH && !existsSync(p))) {
    throw new Error("Không tìm thấy ffmpeg (ffmpeg-static). Kiểm tra cấu hình outputFileTracingIncludes.");
  }
  return p;
}

export function runFfmpeg(args: string[], timeoutMs = 240_000): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary(), ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg quá thời gian xử lý"));
    }, timeoutMs);
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000); // tránh tràn bộ nhớ
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg lỗi (mã ${code}): ${stderr.split("\n").slice(-6).join(" ").trim()}`));
    });
  });
}

/**
 * Nguồn âm thanh cho ffmpeg: tệp cục bộ, hoặc URL (vd. Google Drive) kèm tuỳ chọn đầu vào
 * như header xác thực — ffmpeg đọc theo HTTP Range nên không cần chép tệp lớn vào /tmp.
 */
export interface AudioSource {
  input: string;
  inputArgs?: string[];
}

/** Đưa mọi nguồn về 16 kHz mono và lọc thông cao 70 Hz (bỏ tiếng ù điện, tiếng rung bàn). */
const BASE_FILTERS = "aresample=16000,aformat=channel_layouts=mono,highpass=f=70";

export interface AnalyzeResult {
  durationSec: number;
  /** Âm lượng trung bình (trung bình công suất) của cả bản ghi, dBFS. */
  meanVolumeDb: number | null;
  /** Ngưỡng lặng đã chọn theo nền ồn thực tế của bản ghi. */
  silenceThresholdDb: number;
  /** Mức nền ồn (bách phân vị 10) và mức lời nói (bách phân vị 90) — để chẩn đoán. */
  noiseFloorDb: number | null;
  speechLevelDb: number | null;
  silences: Interval[];
}

/** Độ dài khung đo RMS (giây). */
export const FRAME_SEC = 0.1;
/** Khoảng lặng ngắn nhất được tính (giây). */
export const MIN_SILENCE_SEC = 0.5;

/**
 * Một lượt giải mã tệp gốc (không ghi tệp âm thanh trung gian; tệp gốc không bị thay đổi):
 * đo RMS từng khung 100 ms → thời lượng, âm lượng trung bình, ngưỡng lặng thích nghi và các khoảng lặng.
 * `workDir` chỉ chứa tệp văn bản nhỏ ghi mức RMS.
 */
export async function analyzeAudio(src: AudioSource, workDir: string): Promise<AnalyzeResult> {
  const levelsFile = path.join(workDir, `levels-${Date.now()}.txt`);
  // Đường dẫn nằm trong chuỗi bộ lọc ffmpeg: không được chứa ký tự đặc biệt (: , ; [ ] ' \)
  if (!/^[\w\-./]+$/.test(levelsFile)) throw new Error(`Thư mục tạm không hợp lệ cho ffmpeg: ${levelsFile}`);
  try {
    await runFfmpeg([
      ...(src.inputArgs ?? []),
      "-i",
      src.input,
      "-vn",
      "-af",
      [
        "aresample=16000",
        "aformat=sample_fmts=flt:channel_layouts=mono",
        "highpass=f=70",
        `asetnsamples=n=${Math.round(16000 * FRAME_SEC)}:p=0`,
        "astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level",
        `ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=${levelsFile}`,
      ].join(","),
      "-f",
      "null",
      "-",
    ]);
    const levels = parseLevels(await readFile(levelsFile, "utf8"));
    return analyzeLevels(levels);
  } finally {
    await rm(levelsFile, { force: true });
  }
}

/** Đọc các dòng "lavfi.astats.Overall.RMS_level=-35.2" (−inf → −120 dB). */
export function parseLevels(text: string): number[] {
  const out: number[] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf("RMS_level=");
    if (i < 0) continue;
    const v = parseFloat(line.slice(i + 10));
    out.push(Number.isFinite(v) ? Math.max(-120, v) : -120);
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
}

export function analyzeLevels(levels: number[]): AnalyzeResult {
  if (levels.length === 0) {
    return { durationSec: 0, meanVolumeDb: null, silenceThresholdDb: -40, noiseFloorDb: null, speechLevelDb: null, silences: [] };
  }
  const meanPower = levels.reduce((acc, v) => acc + 10 ** (v / 10), 0) / levels.length;
  const sorted = [...levels].sort((a, b) => a - b);
  const noise = percentile(sorted, 10);
  const speech = percentile(sorted, 90);
  const threshold = chooseSilenceThreshold(noise, speech);
  return {
    durationSec: Math.round(levels.length * FRAME_SEC * 100) / 100,
    meanVolumeDb: meanPower > 0 ? Math.round(10 * Math.log10(meanPower) * 10) / 10 : null,
    silenceThresholdDb: threshold,
    noiseFloorDb: Math.round(noise * 10) / 10,
    speechLevelDb: Math.round(speech * 10) / 10,
    silences: levelsToSilences(levels, threshold),
  };
}

/**
 * Ngưỡng lặng thích nghi theo tỷ lệ tín hiệu/nền của chính bản ghi (kiểu VAD năng lượng):
 * nền ồn + 25% khoảng cách tới mức lời nói (tối thiểu +3 dB), giới hạn [−60, −20] dB.
 * Hội trường ồn (nền −40, lời −24) → −36 dB; phòng yên tĩnh (nền −70, lời −25) → −59 dB.
 */
export function chooseSilenceThreshold(noiseFloorDb: number, speechLevelDb: number): number {
  const t = noiseFloorDb + Math.max(3, 0.25 * (speechLevelDb - noiseFloorDb));
  return Math.round(Math.max(-60, Math.min(-20, t)) * 10) / 10;
}

/** Chuỗi khung dưới ngưỡng dài ≥ MIN_SILENCE_SEC → khoảng lặng. */
export function levelsToSilences(levels: number[], thresholdDb: number, minSec = MIN_SILENCE_SEC): Interval[] {
  const minFrames = Math.max(1, Math.round(minSec / FRAME_SEC));
  const out: Interval[] = [];
  let runStart = -1;
  for (let i = 0; i <= levels.length; i++) {
    const silent = i < levels.length && levels[i] < thresholdDb;
    if (silent && runStart < 0) runStart = i;
    if (!silent && runStart >= 0) {
      if (i - runStart >= minFrames) {
        out.push({ start: Math.round(runStart * FRAME_SEC * 100) / 100, end: Math.round(i * FRAME_SEC * 100) / 100 });
      }
      runStart = -1;
    }
  }
  return out;
}

export type NormalizeMode = "gain" | "dynaudnorm" | "none";

/** Chấp nhận cả giá trị cũ "loudnorm" (nay là chuẩn hoá tuyến tính "gain"). */
export function toNormalizeMode(v: unknown): NormalizeMode {
  return v === "dynaudnorm" || v === "none" ? v : "gain";
}

/**
 * Mức khuếch đại tuyến tính (dB) đưa âm lượng trung bình cả bản ghi về khoảng −22 dBFS.
 * Cùng một mức cho mọi đoạn → giữ nguyên động học giọng nói, các đoạn nhất quán với nhau.
 */
export function normalizationGainDb(meanVolumeDb: number | null): number {
  if (meanVolumeDb === null || !Number.isFinite(meanVolumeDb)) return 0;
  const g = -22 - meanVolumeDb;
  return Math.round(Math.max(-6, Math.min(18, g)) * 10) / 10;
}

export interface EncodeOptions {
  /**
   * "gain" (mặc định): khuếch đại tuyến tính theo âm lượng cả bản ghi + chặn đỉnh (không méo, nhanh);
   * "dynaudnorm": nâng các đoạn nhỏ tiếng — hợp với người nói xa micro;
   * "none": giữ nguyên.
   */
  normalize: NormalizeMode;
  /** Mức khuếch đại cho chế độ "gain" — tính bằng normalizationGainDb(). */
  gainDb: number;
  /** Khử nhiễu nhẹ (FFT). Mặc định tắt: nghiên cứu cho thấy khử nhiễu thường làm TĂNG lỗi nhận dạng. */
  denoise: boolean;
}

export function encodeFilters(opts: EncodeOptions): string {
  const f = [BASE_FILTERS];
  if (opts.denoise) f.push("afftdn=nf=-25:tn=1");
  if (opts.normalize === "gain" && opts.gainDb !== 0) {
    f.push(`volume=${opts.gainDb}dB`, "alimiter=limit=0.891:level=disabled");
  } else if (opts.normalize === "dynaudnorm") {
    f.push("dynaudnorm=f=200:g=11:p=0.9:m=12");
  }
  return f.join(",");
}

/**
 * Cắt [start, end] từ tệp gốc và mã hoá FLAC 16 kHz mono 16-bit (không mất dữ liệu ở 16 kHz)
 * để gửi mô hình. end = null → tới hết tệp.
 */
export async function encodeChunk(
  src: AudioSource,
  start: number,
  end: number | null,
  outPath: string,
  opts: EncodeOptions,
): Promise<void> {
  await runFfmpeg([
    "-y",
    ...(src.inputArgs ?? []),
    ...(start > 0 ? ["-ss", start.toFixed(3)] : []),
    ...(end !== null ? ["-to", end.toFixed(3)] : []),
    "-i",
    src.input,
    "-vn",
    "-af",
    encodeFilters(opts),
    "-ar",
    "16000",
    "-ac",
    "1",
    "-sample_fmt",
    "s16",
    "-c:a",
    "flac",
    "-compression_level",
    "5",
    outPath,
  ]);
}
