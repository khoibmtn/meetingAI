import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { claudeAllowsSampling, verbosityInstruction } from "../catalog";
import { AiError, effectiveParams, type ConnectionConfig, type JsonRequest, type TextRequest } from "../types";

function client(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">) {
  const baseURL = conn.baseUrl?.trim();
  return new Anthropic({ apiKey: conn.apiKey, ...(baseURL ? { baseURL } : {}) });
}

function mapError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError("Khoá API Anthropic không hợp lệ hoặc không có quyền", "auth");
  }
  if (err instanceof Anthropic.RateLimitError) return new AiError("Claude đang giới hạn tần suất (429)", "rate_limit", true);
  if (err instanceof Anthropic.NotFoundError) return new AiError(`Không tìm thấy mô hình Claude: ${err.message}`, "bad_request");
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Yêu cầu Claude không hợp lệ: ${err.message}`, "bad_request");
  if (err instanceof Anthropic.APIConnectionError) return new AiError(`Không kết nối được Anthropic: ${err.message}`, "unavailable", true);
  if (err instanceof Anthropic.APIError) {
    return new AiError(`Claude lỗi: ${err.message}`, "unavailable", (err.status ?? 500) >= 500);
  }
  if (err instanceof AiError) return err;
  return new AiError(err instanceof Error ? err.message : String(err));
}

/**
 * Tham số theo dòng mô hình:
 * - Opus 5 / Fable: suy luận thích ứng + effort + fallback phía máy chủ khi bị từ chối.
 * - Sonnet 5, Opus 4.6+: suy luận thích ứng + effort.
 * - Haiku 4.5 và cũ hơn: không dùng adaptive thinking / effort.
 * - temperature/top_p bị loại bỏ trên Opus 4.7+/Sonnet 5/Fable → tự bỏ qua.
 */
function buildParams(req: TextRequest, fallbackMax: number) {
  const p = effectiveParams(req, fallbackMax);
  const model = req.conn.model;
  const legacy = /^claude-(haiku|3|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0)/.test(model) || /claude-3/.test(model);
  const effort = p.effort ? (p.effort === "minimal" ? "low" : p.effort) : "medium";
  const wantsFallback = /^claude-(opus-5|fable)/.test(model);
  const hint = verbosityInstruction(p.verbosity);
  return {
    max_tokens: p.maxOutputTokens,
    system: [
      // Transcript dài nằm trong system → đánh dấu cache để các câu hỏi sau rẻ hơn.
      { type: "text" as const, text: hint ? `${req.system}\n\n${hint}` : req.system, cache_control: { type: "ephemeral" as const } },
    ],
    ...(legacy ? {} : { thinking: { type: "adaptive" as const }, output_config: { effort } }),
    ...(claudeAllowsSampling(model) && p.temperature != null ? { temperature: p.temperature } : {}),
    ...(claudeAllowsSampling(model) && p.topP != null ? { top_p: p.topP } : {}),
    ...(wantsFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    ...(p.extra ?? {}),
  };
}

export async function* anthropicStreamText(req: TextRequest): AsyncGenerator<string> {
  try {
    const stream = client(req.conn).beta.messages.stream(
      {
        model: req.conn.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...buildParams(req, 64000),
      },
      { signal: req.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new AiError("Claude từ chối yêu cầu này", "refusal");
  } catch (err) {
    throw mapError(err);
  }
}

export async function anthropicGenerateJson<T>(req: JsonRequest): Promise<T> {
  try {
    const params = buildParams(req, 32000);
    const outputConfig = "output_config" in params ? params.output_config : {};
    const stream = client(req.conn).beta.messages.stream(
      {
        model: req.conn.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...params,
        output_config: { ...outputConfig, format: { type: "json_schema", schema: req.schema } },
      },
      { signal: req.signal },
    );
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new AiError("Claude từ chối yêu cầu này", "refusal");
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return JSON.parse(text) as T;
  } catch (err) {
    throw mapError(err);
  }
}

export async function anthropicListModels(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">) {
  const out: { id: string; label?: string; created?: number }[] = [];
  try {
    for await (const m of client(conn).models.list({ limit: 100 })) {
      out.push({ id: m.id, label: m.display_name, created: Date.parse(m.created_at) / 1000 });
    }
  } catch (err) {
    throw mapError(err);
  }
  return out.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}
