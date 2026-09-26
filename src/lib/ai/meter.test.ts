import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiUsage, TextRequest } from "./types";

vi.mock("server-only", () => ({}));
const recordUsage = vi.fn(async (..._args: unknown[]) => {});
vi.mock("./usage", () => ({ recordUsage }));
const usage: AiUsage = { model: "deepseek-v4-flash", inputTokens: 1000, cachedInputTokens: 900, cacheWriteTokens: 0, outputTokens: 50, reasoningTokens: 0 };
vi.mock("./providers/openai-compatible", () => ({
  compatStreamText: async function* (req: TextRequest) {
    yield "xin ";
    yield "chào";
    req.onUsage?.(usage);
  },
  compatGenerateJson: vi.fn(async (req: TextRequest) => {
    req.onUsage?.(usage);
    return { ok: true };
  }),
}));

const { streamText, generateJson } = await import("./index");
const conn = { provider: "deepseek" as const, apiKey: "k", model: "deepseek-v4-flash", params: {} };

describe("ghi nhận chi phí ở lớp điều phối AI", () => {
  beforeEach(() => recordUsage.mockClear());

  it("stream: ghi usage khi kết thúc, vẫn chuyển usage cho người gọi", async () => {
    const seen: AiUsage[] = [];
    let text = "";
    for await (const t of streamText({
      conn,
      system: "s",
      messages: [{ role: "user", content: "q" }],
      usage: { task: "chat", userId: "u1", recordingId: "r1" },
      onUsage: (u) => seen.push(u),
    })) {
      text += t;
    }
    expect(text).toBe("xin chào");
    expect(seen).toEqual([usage]);
    expect(recordUsage).toHaveBeenCalledWith(conn, { task: "chat", userId: "u1", recordingId: "r1" }, [usage]);
  });

  it("không có ngữ cảnh ghi nhận (vd kiểm tra kết nối) → không ghi", async () => {
    for await (const t of streamText({ conn, system: "s", messages: [{ role: "user", content: "q" }] })) void t;
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("JSON: ghi usage của lần gọi", async () => {
    await generateJson({ conn, system: "s", messages: [{ role: "user", content: "q" }], schema: {}, usage: { task: "speaker_naming" } });
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage.mock.calls[0][1]).toEqual({ task: "speaker_naming" });
  });
});
