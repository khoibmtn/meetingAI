import type { ModelParams, ProviderKind } from "./catalog";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Cấu hình kết nối đã giải mã khoá — CHỈ dùng phía server. */
export interface ConnectionConfig {
  id?: string;
  name?: string;
  provider: ProviderKind;
  baseUrl?: string | null;
  apiKey: string;
  model: string;
  params: ModelParams;
}

export interface TextRequest {
  conn: ConnectionConfig;
  /** Ngữ cảnh ổn định (transcript, hướng dẫn) — đặt đầu để tận dụng prompt caching. */
  system: string;
  messages: ChatTurn[];
  /** Ghi đè tham số theo tác vụ. */
  overrides?: Partial<ModelParams>;
  /** Mức tối thiểu cho độ dài đầu ra (tác vụ cần đầu ra dài như biên bản). */
  minOutputTokens?: number;
  signal?: AbortSignal;
}

export interface JsonRequest extends TextRequest {
  schema: Record<string, unknown>;
  schemaName?: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "refusal" | "bad_request" | "unavailable" | "overloaded" | "unknown" = "unknown",
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function effectiveParams(req: TextRequest, fallbackMax: number): ModelParams & { maxOutputTokens: number } {
  const merged: ModelParams = { ...req.conn.params, ...(req.overrides ?? {}) };
  const max = Math.max(merged.maxOutputTokens ?? fallbackMax, req.minOutputTokens ?? 0);
  return { ...merged, maxOutputTokens: max };
}

/** Thông báo khi Gemini trả 503 "high demand" — cũng dùng để nhận diện lại từ lỗi đã lưu trong CSDL. */
export const GEMINI_OVERLOADED = "Gemini đang quá tải";

/** Mô hình dự phòng cấu hình trong kết nối (khác mô hình chính), dùng khi mô hình chính quá tải. */
export function fallbackModelFor(conn: Pick<ConnectionConfig, "model" | "params">): string | null {
  const m = conn.params?.fallbackModel?.trim();
  return m && m !== conn.model ? m : null;
}
