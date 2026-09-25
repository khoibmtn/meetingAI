import { AiError, fallbackModelFor, GEMINI_OVERLOADED, type ConnectionConfig } from "@/lib/ai/types";

/**
 * Chính sách thử lại một đoạn phiên âm.
 *  - Lỗi nhất thời (Gemini quá tải 503, giới hạn tần suất 429, lỗi mạng): thử tới 8 lần, giãn cách
 *    15 s → 3 phút (~13 phút) — đợt quá tải của Gemini thường kéo dài vài phút.
 *  - Lỗi khác (đầu ra rỗng, JSON hỏng…): 3 lần, giãn cách 10 s, 20 s.
 * Sau 2 lần quá tải, nếu kết nối có mô hình dự phòng thì chuyển sang mô hình đó.
 */
export const MAX_CHUNK_ATTEMPTS = 3;
export const MAX_TRANSIENT_ATTEMPTS = 8;
/** Giới hạn chờ trong MỘT lần gọi worker (maxDuration 300 s); chờ lâu hơn thì worker tự gọi lại. */
export const MAX_RETRY_WAIT_MS = 90_000;
export const MAX_TRANSIENT_WAIT_MS = 180_000;
export const FALLBACK_AFTER_OVERLOADS = 2;

export function isTransientError(err: unknown): boolean {
  if (err instanceof AiError) return err.retryable && err.kind !== "auth";
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(String(err));
}

export function maxAttemptsFor(err: unknown): number {
  return isTransientError(err) ? MAX_TRANSIENT_ATTEMPTS : MAX_CHUNK_ATTEMPTS;
}

export function retryDelayMs(err: unknown, attempt: number, baseMs = 10_000): number {
  const n = Math.max(0, attempt - 1);
  if (isTransientError(err)) {
    const rateLimited = err instanceof AiError && err.kind === "rate_limit";
    return Math.min((rateLimited ? baseMs * 3 : baseMs * 1.5) * 2 ** n, MAX_TRANSIENT_WAIT_MS);
  }
  return Math.min(baseMs * 2 ** n, MAX_RETRY_WAIT_MS);
}

/** Mô hình cho lần thử tiếp theo: lần trước quá tải và đã thử ≥ 2 lần → mô hình dự phòng (nếu có). */
export function chunkModel(conn: Pick<ConnectionConfig, "model" | "params">, prevAttempts: number, prevError: string | null): string {
  const fallback = fallbackModelFor(conn);
  if (fallback && prevAttempts >= FALLBACK_AFTER_OVERLOADS && prevError?.includes(GEMINI_OVERLOADED)) return fallback;
  return conn.model;
}
