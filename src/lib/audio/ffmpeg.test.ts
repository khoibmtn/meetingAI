import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
  analyzeAudio,
  analyzeLevels,
  chooseSilenceThreshold,
  encodeChunk,
  encodeFilters,
  ffmpegSelfTest,
  levelsToSilences,
  normalizationGainDb,
  parseLevels,
  runFfmpeg,
  toNormalizeMode,
  type AudioSource,
} from "./ffmpeg";

// Âm thanh tổng hợp 60 s giống phòng họp: nền ồn liên tục (~−45 dBFS), cứ 5 s có 3 s "tiếng nói"
// rồi 2 s chỉ còn nền ồn; lưu dạng m4a như điện thoại.
let dir: string;
let sample: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ffmpeg-test-"));
  sample = path.join(dir, "sample.m4a");
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='if(lt(mod(t,5),3),0.2*sin(2*PI*220*t)+0.1*sin(2*PI*660*t),0)+0.008*(random(0)-0.5)':s=44100:d=60",
    "-ac",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    sample,
  ]);
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Âm lượng đỉnh (dBFS) của một tệp, đo bằng volumedetect. */
async function peakDb(file: string): Promise<number> {
  const { stderr } = await runFfmpeg(["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const all = [...stderr.matchAll(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/g)];
  return parseFloat(all[all.length - 1][1]);
}

describe("phân tích âm thanh (một lượt giải mã)", () => {
  it("đo thời lượng, âm lượng, nền ồn và dò đúng các khoảng lặng 2 giây", async () => {
    const r = await analyzeAudio({ input: sample }, dir);
    expect(r.durationSec).toBeGreaterThan(59.8);
    expect(r.durationSec).toBeLessThan(60.3);
    expect(r.meanVolumeDb!).toBeLessThan(0);
    expect(r.noiseFloorDb!).toBeLessThan(r.speechLevelDb!);
    // Ngưỡng phải nằm giữa nền ồn và tiếng nói
    expect(r.silenceThresholdDb).toBeGreaterThan(r.noiseFloorDb!);
    expect(r.silenceThresholdDb).toBeLessThan(r.speechLevelDb!);
    const inner = r.silences.filter((s) => s.end < r.durationSec - 0.5);
    expect(inner.length).toBeGreaterThanOrEqual(11);
    for (const s of inner) {
      expect(s.end - s.start).toBeGreaterThan(1.6);
      expect(s.end - s.start).toBeLessThan(2.4);
    }
  }, 30_000);

  it("parseLevels đọc đầu ra ametadata, −inf thành −120 dB", () => {
    const text = [
      "frame:0    pts:0       pts_time:0",
      "lavfi.astats.Overall.RMS_level=-49.367051",
      "frame:1    pts:1600    pts_time:0.1",
      "lavfi.astats.Overall.RMS_level=-inf",
      "",
    ].join("\n");
    expect(parseLevels(text)).toEqual([-49.367051, -120]);
  });

  it("levelsToSilences chỉ lấy chuỗi khung dưới ngưỡng dài ≥ 0,5 s", () => {
    const L = (db: number, n: number) => Array<number>(n).fill(db);
    const levels = [...L(-20, 10), ...L(-50, 4), ...L(-20, 5), ...L(-50, 8), ...L(-20, 3), ...L(-50, 6)];
    expect(levelsToSilences(levels, -40)).toEqual([
      { start: 1.9, end: 2.7 },
      { start: 3, end: 3.6 },
    ]);
  });

  it("ngưỡng lặng theo tỷ lệ tín hiệu/nền của bản ghi", () => {
    expect(chooseSilenceThreshold(-40, -24)).toBe(-36); // hội trường ồn (số đo thật của bản ghi giao ban mẫu)
    expect(chooseSilenceThreshold(-70, -25)).toBe(-58.7); // phòng yên tĩnh
    expect(chooseSilenceThreshold(-35, -33)).toBe(-32); // nền ồn gần bằng tiếng nói: tối thiểu +3 dB
    expect(chooseSilenceThreshold(-120, -30)).toBe(-60); // có đoạn im tuyệt đối: chặn dưới
    expect(chooseSilenceThreshold(-15, -5)).toBe(-20); // chặn trên
  });

  it("analyzeLevels: tệp rỗng → thời lượng 0", () => {
    expect(analyzeLevels([]).durationSec).toBe(0);
  });
});

describe("mã hoá đoạn gửi mô hình", () => {
  it("cắt đúng khoảng, FLAC 16 kHz mono 16-bit", async () => {
    const out = path.join(dir, "chunk.flac");
    await encodeChunk({ input: sample }, 10, 30, out, { normalize: "gain", gainDb: 6, denoise: false });
    const { stderr } = await runFfmpeg(["-i", out, "-f", "null", "-"]);
    expect(stderr).toMatch(/Audio: flac, 16000 Hz, mono, s16/);
    const r = await analyzeAudio({ input: out }, dir);
    expect(r.durationSec).toBeGreaterThan(19.9);
    expect(r.durationSec).toBeLessThan(20.1);
    // 16-bit: 20 s × 16 kHz × 2 byte = 640 kB trước nén; FLAC phải nhỏ hơn thế
    expect((await stat(out)).size).toBeLessThan(640_000);
  }, 30_000);

  it("khuếch đại tuyến tính kèm chặn đỉnh: không vượt 0 dBFS", async () => {
    const out = path.join(dir, "loud.flac");
    await encodeChunk({ input: sample }, 0, 10, out, { normalize: "gain", gainDb: 18, denoise: false });
    expect(await peakDb(out)).toBeLessThanOrEqual(0);
  }, 30_000);

  it("mã hoá cả tệp khi end = null", async () => {
    const out = path.join(dir, "full.flac");
    await encodeChunk({ input: sample }, 0, null, out, { normalize: "none", gainDb: 0, denoise: false });
    const r = await analyzeAudio({ input: out }, dir);
    expect(r.durationSec).toBeGreaterThan(59.8);
  }, 30_000);
});

describe("đọc trực tiếp qua HTTP (tệp lớn trên Drive)", () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    const data = await readFile(sample);
    server = createServer((req, res) => {
      if (req.headers.authorization !== "Bearer token-thu") {
        res.writeHead(401).end();
        return;
      }
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      if (!m) {
        res.writeHead(200, { "Content-Length": data.length, "Accept-Ranges": "bytes", "Content-Type": "audio/mp4" });
        res.end(data);
        return;
      }
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
      res.writeHead(206, {
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Accept-Ranges": "bytes",
        "Content-Type": "audio/mp4",
      });
      res.end(data.subarray(start, end + 1));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/files/abc?alt=media`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const withAuth = (): AudioSource => ({ input: url, inputArgs: ["-headers", "Authorization: Bearer token-thu\r\n"] });

  it("phân tích và cắt đoạn qua HTTP có xác thực", async () => {
    const r = await analyzeAudio(withAuth(), dir);
    expect(r.durationSec).toBeGreaterThan(59.8);
    const out = path.join(dir, "remote.flac");
    await encodeChunk(withAuth(), 40, 50, out, { normalize: "gain", gainDb: 3, denoise: false });
    const c = await analyzeAudio({ input: out }, dir);
    expect(c.durationSec).toBeGreaterThan(9.9);
    expect(c.durationSec).toBeLessThan(10.1);
  }, 30_000);

  it("thiếu xác thực thì báo lỗi, không treo", async () => {
    await expect(analyzeAudio({ input: url }, dir)).rejects.toThrow(/ffmpeg lỗi/);
  }, 30_000);
});

describe("tự kiểm tra (trang Kiểm tra hệ thống)", () => {
  it("ffmpeg chạy được, mã hoá và phân tích lại đúng", async () => {
    const r = await ffmpegSelfTest();
    expect(r.version).toMatch(/^ffmpeg \d/);
    expect(r.ms).toBeGreaterThan(0);
  }, 30_000);
});

describe("tham số chuẩn hoá", () => {
  it("mức khuếch đại đưa âm lượng trung bình về ~−22 dBFS, có giới hạn", () => {
    expect(normalizationGainDb(-27.4)).toBe(5.4);
    expect(normalizationGainDb(-60)).toBe(18);
    expect(normalizationGainDb(-5)).toBe(-6);
    expect(normalizationGainDb(null)).toBe(0);
  });

  it("chuỗi bộ lọc theo chế độ", () => {
    expect(encodeFilters({ normalize: "gain", gainDb: 5.4, denoise: false })).toContain("volume=5.4dB,alimiter");
    expect(encodeFilters({ normalize: "gain", gainDb: 0, denoise: false })).not.toContain("volume=");
    expect(encodeFilters({ normalize: "dynaudnorm", gainDb: 5, denoise: true })).toMatch(/afftdn.*dynaudnorm/);
    expect(encodeFilters({ normalize: "none", gainDb: 5, denoise: false })).toBe(
      "aresample=16000,aformat=channel_layouts=mono,highpass=f=70",
    );
  });

  it("giá trị cũ 'loudnorm' và giá trị lạ được hiểu là 'gain'", () => {
    expect(toNormalizeMode("loudnorm")).toBe("gain");
    expect(toNormalizeMode("xyz")).toBe("gain");
    expect(toNormalizeMode("none")).toBe("none");
    expect(toNormalizeMode("dynaudnorm")).toBe("dynaudnorm");
  });
});
