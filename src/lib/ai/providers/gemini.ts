import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig } from "@google/genai";
import { verbosityInstruction, type Effort } from "../catalog";
import { AiError, effectiveParams, type ConnectionConfig, type JsonRequest, type TextRequest } from "../types";

export function geminiClientFor(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">) {
  const baseUrl = conn.baseUrl?.trim();
  const isDefault = !baseUrl || baseUrl.replace(/\/$/, "") === "https://generativelanguage.googleapis.com";
  return new GoogleGenAI({ apiKey: conn.apiKey, ...(isDefault ? {} : { httpOptions: { baseUrl } }) });
}

function toContents(req: TextRequest): Content[] {
  return req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/** Gemini 3.x: thinkingLevel; Gemini 2.x: thinkingBudget. */
export function geminiThinking(model: string, effort?: Effort | null): GenerateContentConfig["thinkingConfig"] {
  if (!effort) return undefined;
  if (/^gemini-3/.test(model)) {
    const level = {
      minimal: ThinkingLevel.MINIMAL,
      low: ThinkingLevel.LOW,
      medium: ThinkingLevel.MEDIUM,
      high: ThinkingLevel.HIGH,
      xhigh: ThinkingLevel.HIGH,
      max: ThinkingLevel.HIGH,
    }[effort];
    // Bản Pro không hỗ trợ MINIMAL/MEDIUM → dùng mức gần nhất
    if (/pro/.test(model) && (level === ThinkingLevel.MINIMAL || level === ThinkingLevel.MEDIUM)) {
      return { thinkingLevel: level === ThinkingLevel.MINIMAL ? ThinkingLevel.LOW : ThinkingLevel.HIGH };
    }
    return { thinkingLevel: level };
  }
  if (/^gemini-2\.5/.test(model)) {
    const budget = { minimal: 0, low: 1024, medium: 8192, high: 24576, xhigh: 32768, max: 32768 }[effort];
    return { thinkingBudget: /pro/.test(model) ? Math.max(128, budget) : budget };
  }
  return undefined;
}

export function geminiConfig(req: TextRequest, fallbackMax: number): GenerateContentConfig {
  const p = effectiveParams(req, fallbackMax);
  const hint = verbosityInstruction(p.verbosity);
  return {
    systemInstruction: hint ? `${req.system}\n\n${hint}` : req.system,
    maxOutputTokens: p.maxOutputTokens,
    ...(p.temperature != null ? { temperature: p.temperature } : {}),
    ...(p.topP != null ? { topP: p.topP } : {}),
    thinkingConfig: geminiThinking(req.conn.model, p.effort),
    abortSignal: req.signal,
    ...(p.extra ?? {}),
  };
}

export function mapGeminiError(err: unknown): AiError {
  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 401 || status === 403) return new AiError("Khoá API Gemini không hợp lệ hoặc không có quyền", "auth");
    if (status === 429) return new AiError("Gemini đang giới hạn tần suất (429) — thử lại sau", "rate_limit", true);
    if (status === 400) return new AiError(`Yêu cầu Gemini không hợp lệ: ${err.message}`, "bad_request");
    if (status === 404) return new AiError(`Không tìm thấy mô hình Gemini: ${err.message}`, "bad_request");
    if (status >= 500) return new AiError("Dịch vụ Gemini tạm thời lỗi", "unavailable", true);
    return new AiError(err.message);
  }
  if (err instanceof AiError) return err;
  return new AiError(err instanceof Error ? err.message : String(err), "unknown", true);
}

export async function* geminiStreamText(req: TextRequest): AsyncGenerator<string> {
  const ai = geminiClientFor(req.conn);
  try {
    const stream = await ai.models.generateContentStream({
      model: req.conn.model,
      contents: toContents(req),
      config: geminiConfig(req, 32768),
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") {
        throw new AiError("Gemini đã chặn nội dung vì lý do an toàn", "refusal");
      }
    }
  } catch (err) {
    throw mapGeminiError(err);
  }
}

export async function geminiGenerateJson<T>(req: JsonRequest): Promise<T> {
  const ai = geminiClientFor(req.conn);
  let text = "";
  try {
    const stream = await ai.models.generateContentStream({
      model: req.conn.model,
      contents: toContents(req),
      config: {
        ...geminiConfig(req, 16384),
        responseMimeType: "application/json",
        responseJsonSchema: req.schema,
      },
    });
    for await (const chunk of stream) text += chunk.text ?? "";
  } catch (err) {
    throw mapGeminiError(err);
  }
  return JSON.parse(text) as T;
}

export async function geminiListModels(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">) {
  const ai = geminiClientFor(conn);
  const out: { id: string; label?: string; description?: string }[] = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 200 } });
    for await (const m of pager) {
      if (!m.name) continue;
      if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
      out.push({ id: m.name.replace(/^models\//, ""), label: m.displayName, description: m.description });
    }
  } catch (err) {
    throw mapGeminiError(err);
  }
  return out;
}
