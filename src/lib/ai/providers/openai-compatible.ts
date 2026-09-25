import "server-only";
import type OpenAI from "openai";
import { PROVIDERS, verbosityInstruction } from "../catalog";
import { parseJsonLoose } from "@/lib/json-repair";
import { AiError, effectiveParams, type JsonRequest, type TextRequest } from "../types";
import { mapOpenAIError, openaiClientFor } from "./openai";

/**
 * Nhà cung cấp dùng giao thức Chat Completions tương thích OpenAI: DeepSeek và dịch vụ tuỳ chỉnh
 * (OpenRouter, Groq, Together, Qwen/DashScope, vLLM, Ollama…).
 */
function label(req: TextRequest) {
  return req.conn.provider === "deepseek" ? "DeepSeek" : req.conn.name || "Dịch vụ AI";
}

function chatBody(req: TextRequest, fallbackMax: number, jsonSchema?: Record<string, unknown>) {
  const p = effectiveParams(req, fallbackMax);
  const hint = verbosityInstruction(p.verbosity);
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
    // DeepSeek không có tham số mức suy luận; dịch vụ tuỳ chỉnh có thể có (reasoning_effort)
    ...(p.effort && req.conn.provider !== "deepseek" ? { reasoning_effort: p.effort === "max" ? "high" : p.effort } : {}),
    ...(jsonSchema && req.conn.provider === "deepseek" ? { response_format: { type: "json_object" } } : {}),
    ...(p.extra ?? {}),
  };
  return body;
}

function client(req: TextRequest) {
  return openaiClientFor(req.conn, PROVIDERS[req.conn.provider].defaultBaseUrl);
}

export async function* compatStreamText(req: TextRequest): AsyncGenerator<string> {
  try {
    const stream = await client(req).chat.completions.create(
      { ...chatBody(req, 8192), stream: true } as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal: req.signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.choices?.[0]?.finish_reason === "content_filter") {
        throw new AiError(`${label(req)} đã chặn nội dung`, "refusal");
      }
    }
  } catch (err) {
    throw mapOpenAIError(err, label(req));
  }
}

export async function compatGenerateJson<T>(req: JsonRequest): Promise<T> {
  try {
    const res = await client(req).chat.completions.create(
      { ...chatBody(req, 8192, req.schema), stream: false } as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { signal: req.signal },
    );
    const text = res.choices?.[0]?.message?.content ?? "";
    return parseJsonLoose<T>(text).value;
  } catch (err) {
    if (err instanceof SyntaxError) throw err;
    throw mapOpenAIError(err, label(req));
  }
}
