import "server-only";
import { PROVIDERS, type ProviderKind } from "./catalog";
import { AiError, type ConnectionConfig, type JsonRequest, type TextRequest } from "./types";
import { geminiGenerateJson, geminiListModels, geminiStreamText } from "./providers/gemini";
import { openaiGenerateJson, openaiListModels, openaiStreamText } from "./providers/openai";
import { anthropicGenerateJson, anthropicListModels, anthropicStreamText } from "./providers/anthropic";
import { compatGenerateJson, compatStreamText } from "./providers/openai-compatible";
import { sleep } from "@/lib/utils";

export { AiError } from "./types";
export type { ChatTurn, TextRequest, JsonRequest, ConnectionConfig } from "./types";

function assertLlm(provider: ProviderKind) {
  if (PROVIDERS[provider].kind !== "llm") {
    throw new AiError(`${PROVIDERS[provider].label} chỉ dùng cho phiên âm, không dùng cho tác vụ văn bản`, "bad_request");
  }
}

export function streamText(req: TextRequest): AsyncGenerator<string> {
  assertLlm(req.conn.provider);
  switch (req.conn.provider) {
    case "gemini":
      return geminiStreamText(req);
    case "openai":
      return openaiStreamText(req);
    case "anthropic":
      return anthropicStreamText(req);
    default:
      return compatStreamText(req);
  }
}

export async function generateText(req: TextRequest): Promise<string> {
  let out = "";
  for await (const t of streamText(req)) out += t;
  return out;
}

/** Sinh JSON theo schema; tự thử lại khi lỗi tạm thời (429/5xx) hoặc JSON hỏng. */
export async function generateJson<T>(req: JsonRequest, retries = 2): Promise<T> {
  assertLlm(req.conn.provider);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      switch (req.conn.provider) {
        case "gemini":
          return await geminiGenerateJson<T>(req);
        case "openai":
          return await openaiGenerateJson<T>(req);
        case "anthropic":
          return await anthropicGenerateJson<T>(req);
        default:
          return await compatGenerateJson<T>(req);
      }
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof SyntaxError || (err instanceof AiError && err.retryable);
      if (!retryable || attempt === retries) break;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export interface ModelListItem {
  id: string;
  label?: string;
  description?: string;
}

/** Tải danh sách mô hình hiện có từ API của nhà cung cấp (theo khoá + base URL người dùng nhập). */
export async function listModels(conn: Pick<ConnectionConfig, "provider" | "apiKey" | "baseUrl">): Promise<ModelListItem[]> {
  switch (conn.provider) {
    case "gemini":
      return sortModels(await geminiListModels(conn));
    case "openai":
      return openaiListModels(conn);
    case "anthropic":
      return anthropicListModels(conn);
    case "deepseek":
      return openaiListModels(conn, PROVIDERS.deepseek.defaultBaseUrl, false);
    case "openai_compatible":
      return openaiListModels(conn, undefined, false);
    case "soniox":
      return sonioxListModels(conn);
  }
}

/** Sắp xếp mô hình Gemini: phiên bản mới trước, bản ổn định trước bản preview. */
function sortModels<T extends { id: string }>(items: T[]): T[] {
  const version = (id: string) => {
    const m = id.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  };
  return [...items].sort((a, b) => {
    const dv = version(b.id) - version(a.id);
    if (dv !== 0) return dv;
    const pa = /preview|exp/.test(a.id) ? 1 : 0;
    const pb = /preview|exp/.test(b.id) ? 1 : 0;
    return pa - pb || a.id.localeCompare(b.id);
  });
}

async function sonioxListModels(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">): Promise<ModelListItem[]> {
  const base = (conn.baseUrl?.trim() || PROVIDERS.soniox.defaultBaseUrl).replace(/\/$/, "");
  const res = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${conn.apiKey}` } });
  if (res.status === 401 || res.status === 403) throw new AiError("Khoá API Soniox không hợp lệ", "auth");
  if (!res.ok) return PROVIDERS.soniox.suggestedModels.map((id) => ({ id }));
  const json = (await res.json()) as { models?: { id: string; name?: string; transcription_mode?: string }[] };
  const models = (json.models ?? []).filter((m) => !m.transcription_mode || m.transcription_mode === "async");
  return models.length ? models.map((m) => ({ id: m.id, label: m.name })) : PROVIDERS.soniox.suggestedModels.map((id) => ({ id }));
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  sample?: string;
  error?: string;
}

/** Kiểm tra kết nối bằng một yêu cầu nhỏ, đo độ trễ. */
export async function testConnection(conn: ConnectionConfig): Promise<TestResult> {
  const started = Date.now();
  try {
    if (conn.provider === "soniox") {
      const base = (conn.baseUrl?.trim() || PROVIDERS.soniox.defaultBaseUrl).replace(/\/$/, "");
      const res = await fetch(`${base}/v1/files?limit=1`, {
        headers: { Authorization: `Bearer ${conn.apiKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new AiError(`Soniox trả về HTTP ${res.status}${res.status === 401 ? " (sai khoá API)" : ""}`, "auth");
      return { ok: true, latencyMs: Date.now() - started, sample: "Kết nối Soniox hợp lệ" };
    }
    const text = await generateText({
      conn,
      system: "Bạn là trợ lý kiểm tra kết nối. Chỉ trả lời đúng yêu cầu.",
      messages: [{ role: "user", content: "Trả lời đúng một từ: OK" }],
      minOutputTokens: 1024,
      signal: AbortSignal.timeout(60_000),
    });
    if (!text.trim()) throw new AiError("Mô hình trả về rỗng — kiểm tra lại tên mô hình/tham số", "bad_request");
    return { ok: true, latencyMs: Date.now() - started, sample: text.trim().slice(0, 200) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
