import { describe, expect, it } from "vitest";
import { tokensToSegments } from "./soniox-format";

describe("tokensToSegments", () => {
  it("groups by speaker, sentence and pause", () => {
    const t = (text: string, s: number, e: number, speaker = "1", confidence = 0.9) => ({
      text,
      start_ms: s * 1000,
      end_ms: e * 1000,
      speaker,
      confidence,
    });
    const segs = tokensToSegments([
      t("Mời", 0, 0.3),
      t(" bác", 0.3, 0.5),
      t(" sĩ", 0.5, 0.7),
      t(" Quang.", 0.7, 1.0),
      t("Dạ", 1.4, 1.6, "2"),
      t(" em", 1.6, 1.8, "2"),
      t(" xin", 1.8, 2.0, "2"),
      t(" chào.", 2.0, 2.3, "2"),
      t(" Bệnh", 5.0, 5.3, "2"), // nghỉ 2,7 s -> câu mới
      t(" nhân", 5.3, 5.5, "2"),
      t("[translated]", 5.5, 5.6, "2"),
    ].map((x, i) => (i === 10 ? { ...x, translation_status: "translation" } : x)));
    expect(segs.map((s) => [s.speaker, s.text])).toEqual([
      ["S1", "Mời bác sĩ Quang."],
      ["S2", "Dạ em xin chào."],
      ["S2", "Bệnh nhân"],
    ]);
    expect(segs[1].start).toBeCloseTo(1.4);
    expect(segs[2].end).toBeCloseTo(5.5);
  });
});
