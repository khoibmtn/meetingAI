import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig } from "@google/genai";
import { verbosityInstruction, type Effort } from "../catalog";
import {
  AiError,
  effectiveParams,
  fallbackModelFor,
  GEMINI_FILE_MISSING,
  GEMINI_OVERLOADED,
  GEMINI_RATE_LIMITED,
  isCapacityError,
  type ConnectionConfig,
  type JsonRequest,
  type TextRequest,
} from "../types";

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
    // 403/404 cho TỆP (không phải khoá): tệp Files API hết hạn hoặc thuộc dự án của khoá khác → tải lại tệp là được
    if ((status === 403 || status === 404) && /access the File|File .*(not exist|not found)|may not exist/i.test(err.message)) {
      return new AiError(`${GEMINI_FILE_MISSING} (hết hạn sau 48 giờ, hoặc khoá API đã đổi sang dự án khác)`, "file_missing", true);
    }
    if (status === 401 || status === 403) return new AiError("Khoá API Gemini không hợp lệ hoặc không có quyền", "auth");
    if (status === 429) return new AiError(`${GEMINI_RATE_LIMITED} (429) — thử lại sau`, "rate_limit", true);
    if (status === 400) return new AiError(`Yêu cầu Gemini không hợp lệ: ${err.message}`, "bad_request");
    if (status === 404) return new AiError(`Không tìm thấy mô hình Gemini: ${err.message}`, "bad_request");
    if (status === 503) {
      return new AiError(`${GEMINI_OVERLOADED} (503 — mô hình đang có nhu cầu cao, thường chỉ tạm thời)`, "overloaded", true);
    }
    if (status >= 500) return new AiError(`Dịch vụ Gemini tạm thời lỗi (HTTP ${status})`, "unavailable", true);
    return new AiError(err.message);
  }
  if (err instanceof AiError) return err;
  return new AiError(err instanceof Error ? err.message : String(err), "unknown", true);
}

/** Thứ tự mô hình thử: chính, rồi dự phòng (nếu có). */
function modelsToTry<T extends { conn: ConnectionConfig }>(req: T): T[] {
  const fallback = fallbackModelFor(req.conn);
  return fallback ? [req, { ...req, conn: { ...req.conn, model: fallback } }] : [req];
}

export async function* geminiStreamText(req: TextRequest): AsyncGenerator<string> {
  const ai = geminiClientFor(req.conn);
  const attempts = modelsToTry(req);
  for (const [i, r] of attempts.entries()) {
    let yielded = false;
    try {
      const stream = await ai.models.generateContentStream({
        model: r.conn.model,
        contents: toContents(r),
        config: geminiConfig(r, 32768),
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          yielded = true;
          yield text;
        }
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") {
          throw new AiError("Gemini đã chặn nội dung vì lý do an toàn", "refusal");
        }
      }
      return;
    } catch (err) {
      const mapped = mapGeminiError(err);
      // Quá tải / hết lượt trước khi có chữ nào → chuyển sang mô hình dự phòng
      if (isCapacityError(mapped) && !yielded && i < attempts.length - 1) continue;
      throw mapped;
    }
  }
}

export async function geminiGenerateJson<T>(req: JsonRequest): Promise<T> {
  const ai = geminiClientFor(req.conn);
  const attempts = modelsToTry(req);
  for (const [i, r] of attempts.entries()) {
    let text = "";
    try {
      const stream = await ai.models.generateContentStream({
        model: r.conn.model,
        contents: toContents(r),
        config: {
          ...geminiConfig(r, 16384),
          responseMimeType: "application/json",
          responseJsonSchema: r.schema,
        },
      });
      for await (const chunk of stream) text += chunk.text ?? "";
    } catch (err) {
      const mapped = mapGeminiError(err);
      if (isCapacityError(mapped) && i < attempts.length - 1) continue;
      throw mapped;
    }
    return JSON.parse(text) as T;
  }
  throw new AiError(GEMINI_OVERLOADED, "overloaded", true);
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
