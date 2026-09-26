import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { AiError, GEMINI_OVERLOADED, GEMINI_RATE_LIMITED } from "@/lib/ai/types";
import { mapGeminiError } from "@/lib/ai/providers/gemini";
import { chunkModel, isTransientError, maxAttemptsFor, MAX_TRANSIENT_WAIT_MS, retryDelayMs, servedModelLabel } from "./retry";

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

  it("403 do TỆP không còn (hết hạn / khoá dự án khác) ≠ sai khoá", () => {
    const gone = mapGeminiError(
      new ApiError({ message: "You do not have permission to access the File qk0olzgyh0u3 or it may not exist.", status: 403 }),
    );
    expect([gone.kind, gone.retryable]).toEqual(["file_missing", true]);
    expect(mapGeminiError(new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 403 })).kind).toBe("auth");
    const limited = mapGeminiError(new ApiError({ message: "Resource has been exhausted", status: 429 }));
    expect([limited.kind, limited.message.startsWith(GEMINI_RATE_LIMITED)]).toEqual(["rate_limit", true]);
  });

  it("404 mô hình bị Google ngừng cho khoá mới → báo rõ tên mô hình, không thử lại", () => {
    const gone = mapGeminiError(
      new ApiError({
        message: "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model.",
        status: 404,
      }),
    );
    expect([gone.kind, gone.retryable]).toEqual(["bad_request", false]);
    expect(gone.message).toContain("gemini-2.5-flash không còn được Google cung cấp");
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
    // Hết lượt (429) cũng chuyển; đoạn khác vừa dùng dự phòng → dùng luôn từ lần đầu
    expect(chunkModel(conn, 2, "Gemini đang giới hạn tần suất (429) — thử lại sau")).toBe("gemini-2.5-flash");
    expect(chunkModel(conn, 0, null, true)).toBe("gemini-2.5-flash");
    // Lỗi khác, hoặc không cấu hình dự phòng, hoặc dự phòng trùng mô hình chính → giữ mô hình chính
    expect(chunkModel(conn, 2, "Gemini trả về kết quả rỗng")).toBe("gemini-3.8-flash");
    expect(chunkModel({ model: "gemini-3.8-flash", params: {} }, 3, overloaded.message)).toBe("gemini-3.8-flash");
    expect(chunkModel({ model: "gemini-2.5-flash", params: { fallbackModel: "gemini-2.5-flash" } }, 3, overloaded.message)).toBe(
      "gemini-2.5-flash",
    );
  });

  it("ghi đúng mô hình thực đã phiên âm (không ghi mô hình chính khi mọi đoạn chạy dự phòng)", () => {
    expect(servedModelLabel("gemini-3.8-flash", ["gemini-3.8-flash", null, undefined])).toBe("gemini-3.8-flash");
    expect(servedModelLabel("gemini-3.8-flash", Array(5).fill("gemini-2.5-flash"))).toBe("gemini-2.5-flash");
    expect(servedModelLabel("gemini-3.8-flash", ["gemini-3.8-flash", "gemini-2.5-flash"])).toBe(
      "gemini-3.8-flash + gemini-2.5-flash",
    );
    expect(servedModelLabel("gemini-3.8-flash", [])).toBe("gemini-3.8-flash");
  });
});
