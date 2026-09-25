import { describe, expect, it } from "vitest";
import { formatSrtTime, formatTimecode, parseTimecode } from "./timecode";
import { speechIntervals } from "./silence";
import { planChunks } from "./chunking";
import {
  collapseInlineLoops,
  collapseRepetitions,
  computeCoverage,
  consolidateMinorSpeakers,
  mergeChunkOutputs,
  mergeGapSegments,
  minorSpeakerKeys,
  OTHERS_KEY,
  subtractIntervals,
  toAbsoluteSegments,
} from "./merge";
import { isNearDuplicate } from "./similarity";
import { normalizeName, normalizeSpeakerId, reconcileSpeakers, singleLabel } from "./speakers";

describe("timecode", () => {
  it("parses common formats", () => {
    expect(parseTimecode("01:15")).toBe(75);
    expect(parseTimecode("1:15.5")).toBe(75.5);
    expect(parseTimecode("00:01:15")).toBe(75);
    expect(parseTimecode("1:02:03")).toBe(3723);
    expect(parseTimecode(12.5)).toBe(12.5);
    expect(parseTimecode("12,5")).toBe(12.5);
    expect(parseTimecode("75:30")).toBe(4530);
    expect(Number.isNaN(parseTimecode("abc"))).toBe(true);
    expect(Number.isNaN(parseTimecode("01:75"))).toBe(true);
  });
  it("formats", () => {
    expect(formatTimecode(75.9)).toBe("01:15");
    expect(formatTimecode(3725)).toBe("1:02:05");
    expect(formatSrtTime(75.4)).toBe("00:01:15,400");
  });
});

describe("speechIntervals", () => {
  it("lấy phần bù của các khoảng lặng", () => {
    const dur = 2403.54;
    const s = [
      { start: 10.5, end: 12 },
      { start: 2400, end: dur },
    ];
    expect(speechIntervals(s, dur)).toEqual([
      { start: 0, end: 10.5 },
      { start: 12, end: 2400 },
    ]);
  });
});

describe("planChunks", () => {
  it("keeps short audio in one chunk", () => {
    expect(planChunks(500, [])).toEqual([{ idx: 0, start: 0, end: 500, overlapBefore: 0 }]);
  });
  it("cuts at the middle of silences near targets", () => {
    const silences = [
      { start: 590, end: 592 },
      { start: 640, end: 641 },
      { start: 1205, end: 1208 },
    ];
    const plans = planChunks(2403, silences, { targetSec: 600, searchSec: 90 });
    expect(plans[0]).toMatchObject({ start: 0, end: 591, overlapBefore: 0 });
    expect(plans[1]).toMatchObject({ start: 591, end: 1206.5, overlapBefore: 0 });
    // Không có khoảng lặng quanh 1806 -> cắt cứng có chồng lấn
    expect(plans[2].end).toBeCloseTo(1806.5, 1);
    expect(plans[3].overlapBefore).toBe(8);
    expect(plans[plans.length - 1].end).toBe(2403);
    // Liên tục, không hở
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].start).toBeLessThanOrEqual(plans[i - 1].end);
    }
  });
  it("merges a short tail into the previous chunk", () => {
    const plans = planChunks(700, [], { targetSec: 600, minTailSec: 120 });
    expect(plans).toHaveLength(1);
  });
  it("never leaves a tail shorter than minTailSec when cutting at a late silence", () => {
    // Khoảng lặng muộn (1271 s) dài hơn, nằm trong cửa sổ ±90 s nhưng sẽ để lại đoạn cuối chỉ 79 s
    const plans = planChunks(1350, [{ start: 1150, end: 1151 }, { start: 1270, end: 1272 }], {
      targetSec: 600,
      searchSec: 90,
      minTailSec: 120,
    });
    const tail = plans[plans.length - 1];
    expect(tail.end - tail.start).toBeGreaterThanOrEqual(120);
  });
});

describe("similarity & speakers", () => {
  it("detects near duplicates across diacritics/punctuation", () => {
    expect(isNearDuplicate("Huyết áp 140/80 mmHg, mạch 70.", "huyet ap 140/80 mmHg mach 70")).toBe(true);
    expect(isNearDuplicate("dạ vâng", "dạ không")).toBe(false);
    expect(
      isNearDuplicate(
        "Bệnh nhân nữ 64 tuổi vào viện vì đau lưng lan xuống hai chân",
        "Bệnh nhân nữ 64 tuổi vào viện vì đau lưng lan xuống hai chân, tê bì kéo dài",
      ),
    ).toBe(true);
  });
  it("normalizes speaker ids and names", () => {
    expect(normalizeSpeakerId("Speaker 2")).toBe("S2");
    expect(normalizeSpeakerId("SPEAKER_03")).toBe("S3");
    expect(normalizeSpeakerId("Người nói 4")).toBe("S4");
    expect(normalizeSpeakerId("s1")).toBe("S1");
    expect(normalizeName("Thầy Hiển (Chủ tọa)")).toBe("hien");
    expect(normalizeName("BS. Hiển")).toBe("hien");
    expect(normalizeName("Bác sĩ Quang")).toBe("quang");
    expect(normalizeName("Nguyễn Văn Anh")).toBe("nguyen van anh");
  });
  it("reconciles speakers across chunks by name", () => {
    const { mapping, speakers } = reconcileSpeakers([
      {
        chunkIdx: 0,
        speakers: [
          { id: "S1", name: "Thầy Hiển", role: "Chủ tọa" },
          { id: "S2", name: "Bác sĩ Quang", role: "Trình bày" },
        ],
        talkTime: { S1: 100, S2: 300 },
      },
      {
        chunkIdx: 1,
        // Mô hình đánh số lại: người chủ tọa thành S3 nhưng vẫn nêu tên
        speakers: [
          { id: "S3", name: "BS Hiển" },
          { id: "S2", name: "Quang" },
          { id: "S4", name: "Bác sĩ Hào" },
        ],
        talkTime: { S3: 200, S2: 20, S4: 150 },
      },
    ]);
    expect(mapping["1:S3"]).toBe("S1");
    expect(mapping["1:S2"]).toBe("S2");
    expect(mapping["1:S4"]).toBe("S4");
    expect(speakers.find((s) => s.key === "S1")?.role).toBe("Chủ tọa");
    expect(speakers.map((s) => s.key)).toEqual(["S1", "S2", "S4"]);
  });
  it("splits a reused id when names clearly differ", () => {
    const { mapping } = reconcileSpeakers([
      { chunkIdx: 0, speakers: [{ id: "S1", name: "Thầy Hiển" }], talkTime: { S1: 10 } },
      { chunkIdx: 1, speakers: [{ id: "S1", name: "Bác sĩ Dương" }], talkTime: { S1: 10 } },
    ]);
    expect(mapping["0:S1"]).toBe("S1");
    expect(mapping["1:S1"]).not.toBe("S1");
  });
  it("giọng mới ở các đoạn chạy song song (M1) không bị gộp nhầm; cùng tên thì về một người", () => {
    const { mapping, speakers } = reconcileSpeakers([
      { chunkIdx: 0, speakers: [{ id: "S1", name: "Thầy" }, { id: "S2", name: "BS. Quang" }], talkTime: { S1: 60, S2: 300 } },
      { chunkIdx: 1, speakers: [{ id: "S1" }, { id: "M1", name: "" }], talkTime: { S1: 40, M1: 30 } },
      { chunkIdx: 2, speakers: [{ id: "S1" }, { id: "M1", name: "BS. Dương" }], talkTime: { S1: 20, M1: 25 } },
      { chunkIdx: 3, speakers: [{ id: "M2", name: "Bác sĩ Dương" }], talkTime: { M2: 10 } },
    ]);
    expect(mapping["1:S1"]).toBe("S1");
    expect(new Set([mapping["1:M1"], mapping["2:M1"]]).size).toBe(2); // hai người mới khác nhau
    expect(mapping["3:M2"]).toBe(mapping["2:M1"]); // cùng tên Dương → một người
    expect(speakers.find((s) => s.key === mapping["2:M1"])?.name).toBe("BS. Dương");
    expect(normalizeSpeakerId("M1")).toBe("M1");
  });
  it("một khoá chỉ mang một tên, một vai trò (không ghép \"BS. A / BS. B\")", () => {
    expect(singleLabel("BS. Quang / BS. Dương")).toBe("BS. Quang");
    expect(singleLabel("Chủ tọa / Giáo sư")).toBe("Chủ tọa");
    expect(singleLabel(" Thầy ")).toBe("Thầy");
    expect(singleLabel(undefined)).toBe("");
    const { speakers } = reconcileSpeakers([
      { chunkIdx: 0, speakers: [{ id: "S1", name: "BS. Quang / BS. Dương", role: "Người trình bày/Bác sĩ" }], talkTime: { S1: 30 } },
    ]);
    expect([speakers[0].name, speakers[0].role]).toEqual(["BS. Quang", "Người trình bày"]);
  });
});

describe("merge", () => {
  it("converts to absolute time, enforces monotonic order and rescales drift", () => {
    const segs = toAbsoluteSegments(
      { idx: 1, start: 600, end: 1200, overlapBefore: 0 },
      {
        speakers: [],
        segments: [
          { start: "00:05", end: "00:09", speaker: "S1", text: "Câu một" },
          { start: "00:03", end: "00:04", speaker: "Speaker 2", text: "Câu hai (mốc lùi)" },
          { start: "bad", end: "", speaker: "S1", text: "Câu ba không có mốc" },
          { start: "01:00", end: "01:00", speaker: "S1", text: "   " },
        ],
      },
    );
    expect(segs).toHaveLength(3);
    expect(segs[0].start).toBe(605);
    expect(segs[1].start).toBeGreaterThanOrEqual(605);
    expect(segs[1].speaker).toBe("S2");
    expect(segs[2].start).toBeGreaterThanOrEqual(segs[1].start);
  });

  it("bỏ câu chỉ có chú thích tiếng động / [không nghe rõ] (không tạo người nói ảo)", () => {
    const segs = toAbsoluteSegments(
      { idx: 0, start: 0, end: 100, overlapBefore: 0 },
      {
        speakers: [],
        segments: [
          { start: "00:01", end: "00:03", speaker: "S0", text: "[tiếng gõ bàn phím]" },
          { start: "00:04", end: "00:05", speaker: "S0", text: "[không nghe rõ]." },
          { start: "00:06", end: "00:09", speaker: "S3", text: "[cười] Thế là cũng hơi bị quá." },
        ],
      },
    );
    expect(segs.map((x) => x.speaker)).toEqual(["S3"]);
  });

  it("rescales timestamps that overshoot the chunk length", () => {
    const segs = toAbsoluteSegments(
      { idx: 0, start: 0, end: 100, overlapBefore: 0 },
      { speakers: [], segments: [{ start: "00:00", end: "03:20", speaker: "S1", text: "dài" }] },
    );
    expect(segs[0].end).toBeLessThanOrEqual(100);
  });

  it("dedupes overlapping boundary and keeps the complete sentence", () => {
    const { segments, duplicatesRemoved } = mergeChunkOutputs([
      {
        plan: { idx: 0, start: 0, end: 600, overlapBefore: 0 },
        result: {
          speakers: [],
          segments: [
            { start: "09:50", end: "09:58", speaker: "S1", text: "Chúng ta chuyển sang phần thảo luận chuyên môn" },
            { start: "09:58", end: "10:00", speaker: "S2", text: "Dạ em xin phép bổ sung về tư thế" },
          ],
        },
      },
      {
        plan: { idx: 1, start: 592, end: 1200, overlapBefore: 8 },
        result: {
          speakers: [],
          segments: [
            { start: "00:06", end: "00:12", speaker: "S2", text: "Dạ em xin phép bổ sung về tư thế nằm sấp và kê đệm cánh chậu" },
            { start: "00:13", end: "00:20", speaker: "S1", text: "Mời em" },
          ],
        },
      },
    ]);
    expect(duplicatesRemoved).toBe(1);
    expect(segments).toHaveLength(3);
    expect(segments[1].text).toContain("kê đệm cánh chậu");
    expect(segments.map((s) => s.id)).toEqual(["s0001", "s0002", "s0003"]);
  });

  it("collapses repetition loops", () => {
    expect(collapseInlineLoops("vâng vâng vâng vâng vâng vâng vâng vâng ạ")).toBe("vâng ạ");
    const base = { speaker: "S1", start: 0, end: 1 };
    const { segments, trimmed } = collapseRepetitions([
      { ...base, text: "Cảm ơn các bác sĩ đã tham dự" },
      { ...base, text: "Cảm ơn các bác sĩ đã tham dự" },
      { ...base, text: "Cảm ơn các bác sĩ đã tham dự" },
      { ...base, text: "Cảm ơn các bác sĩ đã tham dự" },
      { ...base, text: "Buổi giao ban kết thúc" },
    ]);
    expect(segments.map((s) => s.text)).toEqual([
      "Cảm ơn các bác sĩ đã tham dự",
      "Cảm ơn các bác sĩ đã tham dự",
      "Buổi giao ban kết thúc",
    ]);
    expect(trimmed).toBe(2);
  });

  it("computes coverage gaps and merges gap fills without duplicates", () => {
    const speech = [{ start: 0, end: 100 }];
    const segs = [
      { id: "s1", start: 0, end: 30, speaker: "S1", text: "Phần đầu buổi giao ban" },
      { id: "s2", start: 70, end: 100, speaker: "S1", text: "Phần cuối buổi giao ban" },
    ];
    const cov = computeCoverage(segs, speech, { padSec: 1, minGapSec: 15 });
    expect(cov.gaps).toEqual([{ start: 31, end: 69 }]);
    expect(cov.ratio).toBeCloseTo(0.62, 2);

    const { segments, added } = mergeGapSegments(
      segs,
      [
        { start: 40, end: 50, speaker: "S2", text: "Nội dung bị bỏ sót ở giữa" },
        { start: 71, end: 99, speaker: "S1", text: "phần cuối buổi giao ban" }, // trùng -> bỏ
        { start: 300, end: 310, speaker: "S1", text: "ngoài khoảng trống" }, // ngoài cửa sổ -> bỏ
      ],
      cov.gaps[0],
    );
    expect(added).toBe(1);
    expect(segments.map((s) => s.text)).toEqual([
      "Phần đầu buổi giao ban",
      "Nội dung bị bỏ sót ở giữa",
      "Phần cuối buổi giao ban",
    ]);
    expect(segments[1].flags).toContain("gap_fill");
  });

  it("subtracts intervals", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 2, end: 3 }, { start: 5, end: 12 }])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });
});

describe("người nói phụ", () => {
  const seg = (speaker: string, start: number, end: number) => ({ id: `${speaker}-${start}`, speaker, start, end, text: "x" });
  const spk = (key: string, name: string) => ({ key, name, role: null });
  it("gộp người nói chưa rõ tên, nói < 20 giây thành “Thành viên khác”; không gộp người có tên", () => {
    const segments = [seg("S1", 0, 300), seg("S2", 300, 305), seg("S3", 305, 309), seg("S4", 309, 312), seg("S5", 312, 400)];
    const speakers = [spk("S1", "Thầy Hùng"), spk("S2", "Người nói 2"), spk("S3", "Người nói 3"), spk("S4", "BS. Dương"), spk("S5", "Người nói 5")];
    expect(minorSpeakerKeys(segments, speakers)).toEqual(["S2", "S3"]);
    const r = consolidateMinorSpeakers(segments, speakers);
    expect(r.merged).toBe(2);
    expect(r.segments.map((s) => s.speaker)).toEqual(["S1", OTHERS_KEY, OTHERS_KEY, "S4", "S5"]);
    expect(r.speakers.map((s) => s.key)).toEqual(["S1", "S4", "S5", OTHERS_KEY]);
    // chạy lại: không còn gì để gộp
    expect(consolidateMinorSpeakers(r.segments, r.speakers).merged).toBe(0);
    // chỉ 1 người nói phụ → giữ nguyên
    expect(consolidateMinorSpeakers(segments.slice(0, 2), speakers.slice(0, 2)).merged).toBe(0);
  });
});
