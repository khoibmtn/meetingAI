import "server-only";
import OpenAI from "openai";
import { PROVIDERS, verbosityInstruction, type Effort } from "../catalog";
import { parseJsonLoose } from "@/lib/json-repair";
import { AiError, effectiveParams, tokenCount, type AiUsage, type JsonRequest, type TextRequest } from "../types";
import { mapOpenAIError, openaiClientFor } from "./openai";

/**
 * Nhà cung cấp dùng giao thức Chat Completions tương thích OpenAI: DeepSeek và dịch vụ tuỳ chỉnh
 * (OpenRouter, Groq, Together, Qwen/DashScope, vLLM, Ollama…).
 */
function label(req: TextRequest) {
  return req.conn.provider === "deepseek" ? "DeepSeek" : req.conn.name || "Dịch vụ AI";
}

/**
 * Chế độ suy luận (thinking) của DeepSeek V4: mặc định của API là BẬT ở mức "high" — mỗi lời gọi sinh thêm
 * hàng nghìn token suy luận tính theo giá đầu ra. Các tác vụ của ứng dụng (soạn văn bản từ transcript, hỏi đáp
 * có trích dẫn, đặt tên người nói, hiệu đính thuật ngữ) không cần suy luận dài → mặc định TẮT; chỉ bật khi
 * kết nối chọn mức suy luận "Cao" trở lên.
 */
export function deepseekThinking(effort?: Effort | null): Record<string, unknown> {
  if (effort === "high") return { thinking: { type: "enabled" }, reasoning_effort: "high" };
  if (effort === "xhigh" || effort === "max") return { thinking: { type: "enabled" }, reasoning_effort: "max" };
  return { thinking: { type: "disabled" } };
}

export function compatChatBody(req: TextRequest, fallbackMax: number, jsonSchema?: Record<string, unknown>) {
  const p = effectiveParams(req, fallbackMax);
  const deepseek = req.conn.provider === "deepseek";
  const hint = verbosityInstruction(p.verbosity);
  // Thứ tự giữ cố định để phần đầu (system + transcript) giống hệt giữa các lần gọi → trúng cache
  let system = hint ? `${req.system}\n\n${hint}` : req.system;
  if (jsonSchema) {
    system += `\n\nChỉ trả về MỘT đối tượng JSON hợp lệ (không kèm giải thích) theo JSON Schema sau:\n${JSON.stringify(jsonSchema)}`;
  }
  const body: Record<string, unknown> = {
    model: req.conn.model,
    messages: [{ role: "system", content: system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
    max_tokens: p.maxOutputTokens,
    ...(p.temperature != null ? { temperature: p.temperature } : {}),
    ...(p.topP != null ? { top_p: p.topP } : {}),
    ...(deepseek ? deepseekThinking(p.effort) : {}),
    // Dịch vụ tuỳ chỉnh có thể có reasoning_effort (không gửi khi chưa chọn — tránh 400 ở dịch vụ không hỗ trợ)
    ...(p.effort && !deepseek ? { reasoning_effort: p.effort === "max" ? "high" : p.effort } : {}),
    ...(jsonSchema && deepseek ? { response_format: { type: "json_object" } } : {}),
    ...(p.extra ?? {}),
  };
  return body;
}

interface CompatUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_cache_hit_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** Usage kiểu DeepSeek (prompt_cache_hit_tokens) hoặc kiểu OpenAI (prompt_tokens_details.cached_tokens). */
export function compatUsage(model: string, u: CompatUsage | null | undefined): AiUsage | null {
  if (!u) return null;
  return {
    model,
    inputTokens: tokenCount(u.prompt_tokens),
    cachedInputTokens: tokenCount(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens),
    cacheWriteTokens: 0,
    outputTokens: tokenCount(u.completion_tokens),
    reasoningTokens: tokenCount(u.completion_tokens_details?.reasoning_tokens),
  };
}

function client(req: TextRequest) {
  return openaiClientFor(req.conn, PROVIDERS[req.conn.provider].defaultBaseUrl);
}

/** Tham số tối ưu chi phí có thể không được gateway / mô hình cũ chấp nhận. */
const OPTIONAL_PARAMS = ["thinking", "reasoning_effort", "stream_options"] as const;

/** Máy chủ từ chối một tham số tối ưu (400 nêu tên tham số) → gửi lại không kèm, thay vì hỏng tác vụ. */
export function rejectsThinkingParams(err: unknown, body: Record<string, unknown>): boolean {
  if (!(err instanceof OpenAI.BadRequestError)) return false;
  return OPTIONAL_PARAMS.some((k) => k in body && err.message.toLowerCase().includes(k));
}

function withoutThinking(body: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...body };
  for (const k of OPTIONAL_PARAMS) delete rest[k];
  return rest;
}

async function create<T>(req: TextRequest, body: Record<string, unknown>): Promise<T> {
  const send = (b: Record<string, unknown>) =>
    client(req).chat.completions.create(b as unknown as OpenAI.Chat.ChatCompletionCreateParams, { signal: req.signal }) as unknown as Promise<T>;
  try {
    return await send(body);
  } catch (err) {
    if (!rejectsThinkingParams(err, body)) throw err;
    return send(withoutThinking(body));
  }
}

export async function* compatStreamText(req: TextRequest): AsyncGenerator<string> {
  try {
    const stream = await create<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>(req, {
      ...compatChatBody(req, 8192),
      stream: true,
      // DeepSeek trả usage (kèm số token trúng cache) ở gói cuối; dịch vụ tuỳ chỉnh có thể không hỗ trợ → không gửi
      ...(req.conn.provider === "deepseek" ? { stream_options: { include_usage: true } } : {}),
    });
    let usage: AiUsage | null = null;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.choices?.[0]?.finish_reason === "content_filter") {
        throw new AiError(`${label(req)} đã chặn nội dung`, "refusal");
      }
      if (chunk.usage) usage = compatUsage(chunk.model || req.conn.model, chunk.usage as CompatUsage);
    }
    if (usage) req.onUsage?.(usage);
  } catch (err) {
    throw mapOpenAIError(err, label(req));
  }
}

export async function compatGenerateJson<T>(req: JsonRequest): Promise<T> {
  try {
    const res = await create<OpenAI.Chat.ChatCompletion>(req, { ...compatChatBody(req, 8192, req.schema), stream: false });
    const usage = compatUsage(res.model || req.conn.model, res.usage as CompatUsage | undefined);
    if (usage) req.onUsage?.(usage);
    const text = res.choices?.[0]?.message?.content ?? "";
    return parseJsonLoose<T>(text).value;
  } catch (err) {
    if (err instanceof SyntaxError) throw err;
    throw mapOpenAIError(err, label(req));
  }
}
