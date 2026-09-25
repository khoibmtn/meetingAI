import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { AiError, GEMINI_OVERLOADED } from "@/lib/ai/types";
import { mapGeminiError } from "@/lib/ai/providers/gemini";
import { chunkModel, isTransientError, maxAttemptsFor, MAX_TRANSIENT_WAIT_MS, retryDelayMs } from "./retry";

vi.mock("server-only", () => ({}));

const overloaded = mapGeminiError(new ApiError({ message: "This model is currently experiencing high demand.", status: 503 }));
const conn = { model: "gemini-3.8-flash", params: { fallbackModel: "gemini-2.5-flash" } };

describe("lỗi Gemini", () => {
  it("503 “high demand” = quá tải, thử lại được; 500 = lỗi tạm thời; 401 = sai khoá", () => {
    expect(overloaded.kind).toBe("overloaded");
    expect(overloaded.retryable).toBe(true);
    expect(overloaded.message).toContain(GEMINI_OVERLOADED);
    const e500 = mapGeminiError(new ApiError({ message: "Internal", status: 500 }));
    expect([e500.kind, e500.retryable, e500.message]).toEqual(["unavailable", true, "Dịch vụ Gemini tạm thời lỗi (HTTP 500)"]);
    expect(mapGeminiError(new ApiError({ message: "denied", status: 401 })).kind).toBe("auth");
  });
});

describe("chính sách thử lại một đoạn", () => {
  it("phân biệt lỗi nhất thời với lỗi khác", () => {
    expect(isTransientError(overloaded)).toBe(true);
    expect(isTransientError(new AiError("429", "rate_limit", true))).toBe(true);
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientError(new AiError("sai khoá", "auth"))).toBe(false);
    expect(isTransientError(new Error("Mô hình không trả về nội dung cho đoạn có 463 giây tiếng nói"))).toBe(false);
    expect(maxAttemptsFor(overloaded)).toBe(8);
    expect(maxAttemptsFor(new Error("JSON hỏng"))).toBe(3);
  });

  it("quá tải: giãn cách 15 s → 3 phút, tổng ~13 phút; lỗi khác 10 s, 20 s", () => {
    const waits = [1, 2, 3, 4, 5, 6, 7].map((n) => retryDelayMs(overloaded, n));
    expect(waits).toEqual([15_000, 30_000, 60_000, 120_000, 180_000, 180_000, 180_000]);
    expect(Math.max(...waits)).toBe(MAX_TRANSIENT_WAIT_MS);
    expect(waits.reduce((a, b) => a + b, 0) / 60_000).toBeCloseTo(12.75, 2);
    expect(retryDelayMs(new AiError("429", "rate_limit", true), 1)).toBe(30_000);
    expect([1, 2].map((n) => retryDelayMs(new Error("khác"), n))).toEqual([10_000, 20_000]);
    // Kiểm thử rút ngắn giãn cách
    expect(retryDelayMs(overloaded, 1, 1000)).toBe(1500);
  });

  it("chuyển sang mô hình dự phòng sau 2 lần quá tải", () => {
    expect(chunkModel(conn, 0, null)).toBe("gemini-3.8-flash");
    expect(chunkModel(conn, 1, overloaded.message)).toBe("gemini-3.8-flash");
    expect(chunkModel(conn, 2, overloaded.message)).toBe("gemini-2.5-flash");
    expect(chunkModel(conn, 5, overloaded.message)).toBe("gemini-2.5-flash");
    // Lỗi khác, hoặc không cấu hình dự phòng, hoặc dự phòng trùng mô hình chính → giữ mô hình chính
    expect(chunkModel(conn, 2, "Gemini trả về kết quả rỗng")).toBe("gemini-3.8-flash");
    expect(chunkModel({ model: "gemini-3.8-flash", params: {} }, 3, overloaded.message)).toBe("gemini-3.8-flash");
    expect(chunkModel({ model: "gemini-2.5-flash", params: { fallbackModel: "gemini-2.5-flash" } }, 3, overloaded.message)).toBe(
      "gemini-2.5-flash",
    );
  });
});
