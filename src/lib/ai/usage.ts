import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiUsage, ConnectionConfig, UsageContext } from "./types";
import { toUsageSummary, type UsageSummary, type UsageSummaryDbRow } from "./usage-types";

export type { UsageSummary, UsageSummaryRow } from "./usage-types";

/**
 * Ghi nhận token các lần gọi AI (bảng ai_usage). Không bao giờ làm hỏng tác vụ chính:
 * CSDL chưa chạy migration hoặc lỗi ghi → chỉ cảnh báo trong log.
 */
export async function recordUsage(conn: ConnectionConfig, ctx: UsageContext, items: AiUsage[]): Promise<void> {
  if (ctx.task === "test" || !items.length) return;
  try {
    const { error } = await createAdminClient()
      .from("ai_usage")
      .insert(
        items.map((u) => ({
          task: ctx.task,
          provider: conn.provider,
          model: u.model || conn.model,
          connection_id: conn.id ?? null,
          user_id: ctx.userId ?? null,
          recording_id: ctx.recordingId ?? null,
          input_tokens: u.inputTokens,
          cached_input_tokens: u.cachedInputTokens,
          cache_write_tokens: u.cacheWriteTokens,
          output_tokens: u.outputTokens,
          reasoning_tokens: u.reasoningTokens,
        })),
      );
    if (error) console.warn(`[ai_usage] Không ghi được chi phí AI: ${error.message}`);
  } catch (err) {
    console.warn(`[ai_usage] Không ghi được chi phí AI: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Tổng hợp token theo nhà cung cấp / mô hình / tác vụ trong N ngày gần nhất (tính trong CSDL). */
export async function summarizeUsage(days: number): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await createAdminClient().rpc("ai_usage_summary", { since });
  if (error) throw new Error(error.message);
  return toUsageSummary(days, since, (data ?? []) as UsageSummaryDbRow[]);
}
