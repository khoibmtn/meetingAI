/** Kiểu dữ liệu + phép tổng hợp chi phí AI — dùng được cả ở client (không truy cập CSDL). */

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface UsageSummaryRow extends UsageTotals {
  provider: string;
  model: string;
  task: string;
}

export interface UsageSummary {
  days: number;
  since: string;
  rows: UsageSummaryRow[];
  total: UsageTotals;
}

/** Một dòng từ hàm SQL ai_usage_summary (bigint có thể về dạng chuỗi). */
export interface UsageSummaryDbRow {
  provider: string;
  model: string;
  task: string;
  calls: number | string;
  input_tokens: number | string | null;
  cached_input_tokens: number | string | null;
  cache_write_tokens: number | string | null;
  output_tokens: number | string | null;
  reasoning_tokens: number | string | null;
}

const n = (v: number | string | null | undefined) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function toUsageSummary(days: number, since: string, rows: UsageSummaryDbRow[]): UsageSummary {
  const total: UsageTotals = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const out: UsageSummaryRow[] = rows.map((r) => {
    const row: UsageSummaryRow = {
      provider: r.provider,
      model: r.model,
      task: r.task,
      calls: n(r.calls),
      inputTokens: n(r.input_tokens),
      cachedInputTokens: n(r.cached_input_tokens),
      cacheWriteTokens: n(r.cache_write_tokens),
      outputTokens: n(r.output_tokens),
      reasoningTokens: n(r.reasoning_tokens),
    };
    for (const k of Object.keys(total) as (keyof UsageTotals)[]) total[k] += row[k];
    return row;
  });
  out.sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  return { days, since, rows: out, total };
}
