import { describe, expect, it, vi } from "vitest";
import { usageRejectReason } from "./catalog";
import { sanitizeParams } from "./connections";

vi.mock("server-only", () => ({}));

describe("kết nối AI", () => {
  it("bỏ mô hình dự phòng trùng mô hình chính (không có tác dụng)", () => {
    expect(sanitizeParams({ fallbackModel: "gemini-3.8-flash" }, "gemini-3.8-flash").fallbackModel).toBeUndefined();
    expect(sanitizeParams({ fallbackModel: " gemini-2.5-flash " }, "gemini-3.8-flash").fallbackModel).toBe("gemini-2.5-flash");
    expect(sanitizeParams({ fallbackModel: "không hợp lệ!" }, "gemini-3.8-flash").fallbackModel).toBeUndefined();
  });

  it("lý do một kết nối không chọn được cho vị trí sử dụng", () => {
    expect(usageRejectReason("transcription", "gemini")).toBeNull();
    expect(usageRejectReason("transcription", "deepseek")).toBe("chỉ xử lý văn bản, không nghe được âm thanh");
    expect(usageRejectReason("report", "deepseek")).toBeNull();
    expect(usageRejectReason("report", "soniox")).toBe("chỉ dùng để phiên âm");
  });
});
