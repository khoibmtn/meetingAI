import { describe, expect, it } from "vitest";
import { dropVoiceRefEchoes, pickVoiceRefSegments, voiceRefLabel } from "./voice-refs";

const seg = (speaker: string, start: number, end: number, text: string) => ({ speaker, start, end, text });
const LONG = "Em xin trình bày bệnh án gây mê hồi sức phẫu thuật cột sống thắt lưng bệnh nhân nữ 64 tuổi";

describe("giọng mẫu", () => {
  it("chọn câu một mình nói, đủ dài, ưu tiên ~10 giây; thu hẹp mép", () => {
    const picks = pickVoiceRefSegments(
      [
        seg("S1", 0, 2, "Chúng ta bắt đầu nhé các bạn"), // quá ngắn
        seg("S2", 3, 30, LONG), // dài quá 16 s → điểm thấp hơn
        seg("S2", 31, 41, `${LONG} tiếp theo`), // ~10 s → được chọn
        seg("S1", 42, 50, "Cảm ơn bác sĩ Quang, bây giờ mời các bác sĩ cho ý kiến thảo luận"),
        seg("S3", 50.5, 58, "Em có câu hỏi [?] về huyết áp trung bình khi nằm sấp ạ"), // có [?] → loại
      ],
      ["S1", "S2", "S3"],
    );
    expect(picks.get("S2")).toEqual({ start: 31.25, end: 40.8, text: `${LONG} tiếp theo` });
    expect(picks.get("S1")).toEqual({ start: 42.25, end: 49.8, text: expect.stringContaining("Cảm ơn") });
    expect(picks.has("S3")).toBe(false);
  });

  it("bỏ câu chồng lấn giọng người khác và giới hạn độ dài đoạn mẫu 12 giây", () => {
    const picks = pickVoiceRefSegments(
      [seg("S1", 0, 20, LONG), seg("S2", 19, 25, "Dạ vâng em hiểu rồi ạ thưa thầy"), seg("S3", 30, 50, LONG)],
      ["S1", "S3"],
    );
    expect(picks.has("S1")).toBe(false); // câu sau của S2 chen vào 1 giây cuối
    expect(picks.get("S3")!.end - picks.get("S3")!.start).toBeCloseTo(12, 5);
  });

  it("nhãn giọng mẫu và lọc câu mô hình lỡ phiên âm từ giọng mẫu", () => {
    expect(voiceRefLabel({ key: "S1", name: "Thầy", role: "Chủ tọa" })).toBe("S1 — Thầy (Chủ tọa)");
    expect(voiceRefLabel({ key: "S7", name: "Người nói 7", role: null })).toBe("S7 — chưa rõ tên");
    const { kept, dropped } = dropVoiceRefEchoes(
      [
        { text: "Tiếp theo là huyết áp trung bình mục tiêu 65 mmHg" },
        { text: "bệnh án gây mê hồi sức phẫu thuật cột sống thắt lưng" }, // một phần câu mẫu → bỏ
        { text: "Dạ vâng." },
      ],
      [LONG],
    );
    expect(dropped).toBe(1);
    expect(kept.map((k) => k.text)).toEqual(["Tiếp theo là huyết áp trung bình mục tiêu 65 mmHg", "Dạ vâng."]);
  });
});
