import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { parseFfmpegDuration, parseSilenceDetect } from "@/lib/transcription/silence";
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

export interface AnalyzeResult {
  durationSec: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
}

/**
 * Giải mã tệp gốc → WAV 16 kHz mono (định dạng làm việc; tệp gốc KHÔNG bị thay đổi),
 * lọc thông cao 70 Hz để bỏ tiếng ù, đồng thời đo âm lượng trung bình.
 */
export async function decodeToWorkingWav(inputPath: string, outWav: string): Promise<AnalyzeResult> {
  const { stderr } = await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-af",
    "highpass=f=70,volumedetect",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outWav,
  ]);
  const duration = parseFfmpegDuration(stderr);
  const mean = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const max = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  // Với vài định dạng (webm từ MediaRecorder) Duration là N/A → tính từ số mẫu đã giải mã
  const samples = stderr.match(/n_samples:\s*(\d+)/);
  const fromSamples = samples ? parseInt(samples[1], 10) / 16000 : null;
  return {
    durationSec: duration ?? fromSamples ?? 0,
    meanVolumeDb: mean ? parseFloat(mean[1]) : null,
    maxVolumeDb: max ? parseFloat(max[1]) : null,
  };
}

/** Ngưỡng im lặng thích nghi theo âm lượng trung bình của bản ghi. */
export function silenceThresholdDb(meanVolumeDb: number | null): number {
  if (meanVolumeDb === null || !Number.isFinite(meanVolumeDb)) return -40;
  return Math.max(-55, Math.min(-28, Math.round(meanVolumeDb - 14)));
}

export async function detectSilences(wavPath: string, durationSec: number, noiseDb: number): Promise<Interval[]> {
  const { stderr } = await runFfmpeg([
    "-i",
    wavPath,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=0.45`,
    "-f",
    "null",
    "-",
  ]);
  return parseSilenceDetect(stderr, durationSec);
}

export interface EncodeOptions {
  /**
   * Chuẩn hoá âm lượng: "loudnorm" (EBU R128, mặc định), "dynaudnorm" (tăng cường người nói xa micro),
   * "none" (giữ nguyên).
   */
  normalize: "loudnorm" | "dynaudnorm" | "none";
  /** Khử nhiễu nhẹ (FFT). Mặc định tắt: nghiên cứu cho thấy khử nhiễu thường làm TĂNG lỗi nhận dạng. */
  denoise: boolean;
}

/** Cắt một đoạn từ WAV làm việc và mã hoá FLAC 16 kHz mono (không mất dữ liệu) để gửi mô hình. */
export async function encodeChunk(
  wavPath: string,
  start: number,
  end: number,
  outPath: string,
  opts: EncodeOptions,
): Promise<void> {
  const filters = [
    opts.denoise ? "afftdn=nf=-25:tn=1" : null,
    opts.normalize === "loudnorm" ? "loudnorm=I=-20:TP=-2:LRA=11" : null,
    opts.normalize === "dynaudnorm" ? "dynaudnorm=f=200:g=11:p=0.9:m=12" : null,
  ].filter(Boolean);
  await runFfmpeg([
    "-y",
    "-ss",
    start.toFixed(3),
    "-to",
    end.toFixed(3),
    "-i",
    wavPath,
    ...(filters.length ? ["-af", filters.join(",")] : []),
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "flac",
    "-compression_level",
    "5",
    outPath,
  ]);
}
