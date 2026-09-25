import "server-only";
import OpenAI from "openai";
import { AiError, effectiveParams, type ConnectionConfig, type JsonRequest, type TextRequest } from "../types";

export function openaiClientFor(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">, defaultBase?: string) {
  const baseURL = conn.baseUrl?.trim() || defaultBase || undefined;
  return new OpenAI({ apiKey: conn.apiKey, ...(baseURL ? { baseURL } : {}) });
}

export function mapOpenAIError(err: unknown, label = "OpenAI"): AiError {
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new AiError(`Khoá API ${label} không hợp lệ hoặc không có quyền`, "auth");
  }
  if (err instanceof OpenAI.RateLimitError) return new AiError(`${label} đang giới hạn tần suất (429)`, "rate_limit", true);
  if (err instanceof OpenAI.NotFoundError) return new AiError(`${label}: không tìm thấy mô hình/đường dẫn (${err.message})`, "bad_request");
  if (err instanceof OpenAI.BadRequestError) return new AiError(`Yêu cầu ${label} không hợp lệ: ${err.message}`, "bad_request");
  if (err instanceof OpenAI.APIConnectionError) return new AiError(`Không kết nối được ${label}: ${err.message}`, "unavailable", true);
  if (err instanceof OpenAI.APIError) return new AiError(`${label} lỗi: ${err.message}`, "unavailable", (err.status ?? 500) >= 500);
  if (err instanceof AiError) return err;
  return new AiError(err instanceof Error ? err.message : String(err));
}

function openaiEffort(e?: string | null) {
  if (!e) return undefined;
  return (e === "max" ? "xhigh" : e) as "minimal" | "low" | "medium" | "high";
}

function responsesBody(req: TextRequest, fallbackMax: number) {
  const p = effectiveParams(req, fallbackMax);
  return {
    model: req.conn.model,
    instructions: req.system,
    input: req.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: p.maxOutputTokens,
    ...(p.temperature != null ? { temperature: p.temperature } : {}),
    ...(p.topP != null ? { top_p: p.topP } : {}),
    ...(p.effort ? { reasoning: { effort: openaiEffort(p.effort) } } : {}),
    ...(p.verbosity ? { text: { verbosity: p.verbosity } } : {}),
    ...(p.extra ?? {}),
  };
}

/** OpenAI Responses API (streaming). */
export async function* openaiStreamText(req: TextRequest): AsyncGenerator<string> {
  try {
    const stream = await openaiClientFor(req.conn).responses.create(
      { ...responsesBody(req, 32768), stream: true } as OpenAI.Responses.ResponseCreateParamsStreaming,
      { signal: req.signal },
    );
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
      else if (event.type === "response.refusal.delta") throw new AiError("Mô hình từ chối yêu cầu", "refusal");
      else if (event.type === "error") throw new AiError(`OpenAI lỗi: ${event.message}`, "unavailable", true);
      else if (event.type === "response.failed") {
        throw new AiError(`OpenAI lỗi: ${event.response.error?.message ?? "không rõ"}`, "unavailable", true);
      }
    }
  } catch (err) {
    throw mapOpenAIError(err);
  }
}

export async function openaiGenerateJson<T>(req: JsonRequest): Promise<T> {
  try {
    const body = responsesBody(req, 16384);
    const res = await openaiClientFor(req.conn).responses.create(
      {
        ...body,
        text: {
          ...("text" in body ? (body.text as object) : {}),
          format: { type: "json_schema", name: req.schemaName ?? "result", schema: req.schema, strict: false },
        },
      } as OpenAI.Responses.ResponseCreateParamsNonStreaming,
      { signal: req.signal },
    );
    return JSON.parse(res.output_text) as T;
  } catch (err) {
    throw mapOpenAIError(err);
  }
}

const NON_CHAT = /(embedding|tts|whisper|transcribe|dall-e|image|moderation|realtime|audio|search|computer-use|codex-mini|babbage|davinci)/i;

export async function openaiListModels(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">, defaultBase?: string, filterChat = true) {
  const out: { id: string; created?: number }[] = [];
  try {
    for await (const m of openaiClientFor(conn, defaultBase).models.list()) {
      if (filterChat && NON_CHAT.test(m.id)) continue;
      out.push({ id: m.id, created: m.created });
    }
  } catch (err) {
    throw mapOpenAIError(err);
  }
  return out.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}
