import { describe, expect, it, vi } from "vitest";
import { effortBadgeLabel } from "./catalog";
import { historyStart } from "./qa";
import OpenAI from "openai";
import { compatChatBody, compatUsage, deepseekThinking, rejectsThinkingParams } from "./providers/openai-compatible";
import { geminiUsage } from "./providers/gemini";
import { anthropicUsage } from "./providers/anthropic";
import { openaiUsage } from "./providers/openai";
import { toUsageSummary } from "./usage-types";
import type { ConnectionConfig, TextRequest } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const conn = (provider: ConnectionConfig["provider"], params: ConnectionConfig["params"] = {}): ConnectionConfig => ({
  provider,
  apiKey: "k",
  model: provider === "deepseek" ? "deepseek-v4-flash" : "m",
  params,
});
const req = (c: ConnectionConfig): TextRequest => ({ conn: c, system: "HƯỚNG DẪN + TRANSCRIPT", messages: [{ role: "user", content: "Soạn biên bản" }] });

describe("DeepSeek: chế độ suy luận (thinking)", () => {
  it("mặc định TẮT — kể cả khi kết nối để mức Thấp/Vừa (preset Nhanh/Cân bằng)", () => {
    for (const effort of [undefined, null, "minimal", "low", "medium"] as const) {
      expect(deepseekThinking(effort)).toEqual({ thinking: { type: "disabled" } });
    }
    const body = compatChatBody(req(conn("deepseek")), 8192);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("chỉ bật khi chọn Cao trở lên", () => {
    expect(compatChatBody(req(conn("deepseek", { effort: "high" })), 8192)).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
    expect(deepseekThinking("max")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" });
    expect(deepseekThinking("xhigh")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" });
  });

  it("dịch vụ tương thích OpenAI khác: không gửi tham số thinking của DeepSeek", () => {
    const body = compatChatBody(req(conn("openai_compatible", { effort: "low" })), 8192);
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(compatChatBody(req(conn("openai_compatible")), 8192).reasoning_effort).toBeUndefined();
  });

  it("system (phần được cache) đứng đầu và giống hệt giữa các yêu cầu khác nhau", () => {
    const a = compatChatBody({ ...req(conn("deepseek")), messages: [{ role: "user", content: "Template A" }] }, 8192);
    const b = compatChatBody({ ...req(conn("deepseek")), messages: [{ role: "user", content: "Template B" }] }, 8192);
    const [sa, sb] = [a.messages, b.messages] as { role: string; content: string }[][];
    expect(sa[0]).toEqual(sb[0]);
    expect(sa[0].role).toBe("system");
  });

  it("máy chủ không nhận tham số thinking → nhận ra để gửi lại không kèm", () => {
    const bad = new OpenAI.BadRequestError(400, { message: "Unrecognized request argument supplied: thinking" }, "Unrecognized request argument supplied: thinking", new Headers());
    expect(rejectsThinkingParams(bad, { thinking: { type: "disabled" } })).toBe(true);
    expect(rejectsThinkingParams(bad, { model: "x" })).toBe(false);
    const so = new OpenAI.BadRequestError(400, { message: "unknown field stream_options" }, "unknown field stream_options", new Headers());
    expect(rejectsThinkingParams(so, { stream_options: { include_usage: true } })).toBe(true);
    const other = new OpenAI.BadRequestError(400, { message: "max_tokens too large" }, "max_tokens too large", new Headers());
    expect(rejectsThinkingParams(other, { thinking: { type: "disabled" } })).toBe(false);
  });

  it("nhãn trên thẻ kết nối", () => {
    expect(effortBadgeLabel("deepseek", undefined)).toBe("Suy luận: tắt");
    expect(effortBadgeLabel("deepseek", "medium")).toBe("Suy luận: tắt");
    expect(effortBadgeLabel("deepseek", "high")).toBe("Suy luận: Cao");
    expect(effortBadgeLabel("gemini", undefined)).toBeNull();
    expect(effortBadgeLabel("gemini", "low")).toBe("Suy luận: Thấp");
  });
});

describe("đọc usage của từng nhà cung cấp", () => {
  it("DeepSeek: prompt_cache_hit_tokens + token suy luận; kiểu OpenAI: cached_tokens", () => {
    expect(
      compatUsage("deepseek-v4-flash", {
        prompt_tokens: 20_000,
        completion_tokens: 9_000,
        prompt_cache_hit_tokens: 18_000,
        completion_tokens_details: { reasoning_tokens: 6_000 },
      }),
    ).toEqual({ model: "deepseek-v4-flash", inputTokens: 20_000, cachedInputTokens: 18_000, cacheWriteTokens: 0, outputTokens: 9_000, reasoningTokens: 6_000 });
    expect(compatUsage("x", { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 64 } })?.cachedInputTokens).toBe(64);
    expect(compatUsage("x", undefined)).toBeNull();
  });

  it("Gemini: đầu ra = câu trả lời + suy nghĩ; phần trúng cache ngầm định", () => {
    expect(
      geminiUsage("gemini-3.8-flash", { promptTokenCount: 30_000, cachedContentTokenCount: 24_000, candidatesTokenCount: 800, thoughtsTokenCount: 1_200 }),
    ).toEqual({ model: "gemini-3.8-flash", inputTokens: 30_000, cachedInputTokens: 24_000, cacheWriteTokens: 0, outputTokens: 2_000, reasoningTokens: 1_200 });
  });

  it("Claude: tổng đầu vào = phần không cache + đọc cache + ghi cache", () => {
    const u = anthropicUsage("claude-sonnet-5", {
      input_tokens: 50,
      cache_read_input_tokens: 20_000,
      cache_creation_input_tokens: 300,
      output_tokens: 700,
    } as Parameters<typeof anthropicUsage>[1]);
    expect(u).toMatchObject({ inputTokens: 20_350, cachedInputTokens: 20_000, cacheWriteTokens: 300, outputTokens: 700 });
  });

  it("OpenAI Responses: input_tokens gồm phần cache", () => {
    const u = openaiUsage("gpt-6-luna", {
      input_tokens: 12_000,
      input_tokens_details: { cached_tokens: 11_000 },
      output_tokens: 900,
      output_tokens_details: { reasoning_tokens: 400 },
      total_tokens: 12_900,
    } as Parameters<typeof openaiUsage>[1]);
    expect(u).toMatchObject({ inputTokens: 12_000, cachedInputTokens: 11_000, outputTokens: 900, reasoningTokens: 400 });
  });
});

describe("lịch sử hỏi đáp cắt theo bậc (giữ phần đầu request ổn định để trúng cache)", () => {
  it("≤ 24 tin: gửi đủ; vượt ngưỡng: điểm bắt đầu chỉ nhảy mỗi 12 tin", () => {
    expect([0, 10, 24].map((n) => historyStart(n))).toEqual([0, 0, 0]);
    expect([25, 30, 35].map((n) => historyStart(n))).toEqual([12, 12, 12]);
    expect([36, 47].map((n) => historyStart(n))).toEqual([24, 24]);
    for (let n = 0; n < 200; n++) {
      const kept = n - historyStart(n);
      expect(kept).toBeLessThanOrEqual(24);
      expect(historyStart(n) % 2).toBe(0); // luôn bắt đầu ở câu hỏi (cặp hỏi–đáp)
    }
    // Giữa hai lần nhảy, request sau là phần mở rộng của request trước
    const changes = Array.from({ length: 100 }, (_, n) => historyStart(n + 1) !== historyStart(n)).filter(Boolean).length;
    expect(changes).toBeLessThanOrEqual(7);
  });
});

describe("tổng hợp chi phí", () => {
  it("cộng tổng, sắp theo khối lượng, nhận bigint dạng chuỗi", () => {
    const s = toUsageSummary(30, "2026-09-01T00:00:00Z", [
      { provider: "gemini", model: "g", task: "chat", calls: 1, input_tokens: 100, cached_input_tokens: 50, cache_write_tokens: 0, output_tokens: 10, reasoning_tokens: 0 },
      { provider: "deepseek", model: "d", task: "report", calls: "2", input_tokens: "40000", cached_input_tokens: "19000", cache_write_tokens: null, output_tokens: "23000", reasoning_tokens: "0" },
    ]);
    expect(s.rows.map((r) => r.provider)).toEqual(["deepseek", "gemini"]);
    expect(s.total).toEqual({ calls: 3, inputTokens: 40_100, cachedInputTokens: 19_050, cacheWriteTokens: 0, outputTokens: 23_010, reasoningTokens: 0 });
  });
});
