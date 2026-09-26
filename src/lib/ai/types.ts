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

/** Tác vụ gọi AI — ghi nhận chi phí theo tác vụ. "test" (kiểm tra kết nối) không ghi nhận. */
export type AiTask = "transcription" | "report" | "chat" | "speaker_naming" | "term_correction" | "test";

/** Số token một lần gọi (theo báo cáo của nhà cung cấp). */
export interface AiUsage {
  model: string;
  /** Tổng token đầu vào, GỒM phần đọc từ cache. */
  inputTokens: number;
  /** Phần đầu vào đọc từ cache (giá rẻ hơn nhiều: DeepSeek, Gemini, OpenAI, Claude). */
  cachedInputTokens: number;
  /** Phần đầu vào ghi vào cache (Claude tính phụ phí ghi). */
  cacheWriteTokens: number;
  /** Token đầu ra, GỒM token suy luận (thinking). */
  outputTokens: number;
  /** Phần đầu ra dành cho suy luận (nếu nhà cung cấp báo). */
  reasoningTokens: number;
}

/** Ngữ cảnh ghi nhận chi phí (ai gọi, cho bản ghi nào, bằng kết nối nào). */
export interface UsageContext {
  task: AiTask;
  userId?: string | null;
  recordingId?: string | null;
}

export interface TextRequest {
  conn: ConnectionConfig;
  /**
   * Ngữ cảnh ổn định (hướng dẫn, thông tin cuộc họp, transcript) — đặt đầu để tận dụng prompt caching.
   * Nhà cung cấp chỉ cache phần ĐẦU giống hệt nhau giữa các lần gọi: không chèn gì thay đổi theo lần gọi
   * (thời gian, câu hỏi, lựa chọn template) vào đây — những phần đó để trong messages, ở cuối.
   */
  system: string;
  messages: ChatTurn[];
  /** Ghi nhận chi phí theo tác vụ (bỏ trống = không ghi). */
  usage?: UsageContext;
  /** Khoá gom nhóm cache (vd "rec:<id>") — OpenAI dùng để định tuyến về cùng bộ nhớ đệm. */
  cacheKey?: string;
  /** Nhận số token đã dùng sau mỗi lần gọi thành công. */
  onUsage?: (usage: AiUsage) => void;
  /** Ghi đè tham số theo tác vụ. */
  overrides?: Partial<ModelParams>;
  /** Mức tối thiểu cho độ dài đầu ra (tác vụ cần đầu ra dài như biên bản). */
  minOutputTokens?: number;
  signal?: AbortSignal;
  /** Báo mô hình thực sự trả lời (khác conn.model khi đã chuyển sang mô hình dự phòng). */
  onModel?: (model: string) => void;
}

export interface JsonRequest extends TextRequest {
  schema: Record<string, unknown>;
  schemaName?: string;
}

/** Số nguyên không âm từ giá trị usage (nhà cung cấp có thể trả null/undefined). */
export function tokenCount(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "auth"
      | "rate_limit"
      | "refusal"
      | "bad_request"
      | "unavailable"
      | "overloaded"
      | "file_missing"
      | "unknown" = "unknown",
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
/** Thông báo khi Gemini trả 429 (hết lượt/giới hạn tần suất của mô hình). */
export const GEMINI_RATE_LIMITED = "Gemini đang giới hạn tần suất";
/** Tệp đã tải lên Files API không còn dùng được (hết hạn 48 giờ, hoặc khoá API thuộc dự án khác). */
export const GEMINI_FILE_MISSING = "Tệp âm thanh trên Gemini không còn";

/** Lỗi do mô hình hết năng lực phục vụ (quá tải/giới hạn tần suất) — đổi sang mô hình khác có thể qua được. */
export function isCapacityError(err: unknown): boolean {
  return err instanceof AiError && (err.kind === "overloaded" || err.kind === "rate_limit");
}

export function isCapacityMessage(message: string | null | undefined): boolean {
  return !!message && (message.includes(GEMINI_OVERLOADED) || message.includes(GEMINI_RATE_LIMITED));
}

/** Mô hình dự phòng cấu hình trong kết nối (khác mô hình chính), dùng khi mô hình chính quá tải. */
export function fallbackModelFor(conn: Pick<ConnectionConfig, "model" | "params">): string | null {
  const m = conn.params?.fallbackModel?.trim();
  return m && m !== conn.model ? m : null;
}
