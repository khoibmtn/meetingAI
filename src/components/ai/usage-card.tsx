"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS, type ProviderKind } from "@/lib/ai/catalog";
import { apiJson } from "@/lib/client/api";
import type { UsageSummary, UsageTotals } from "@/lib/ai/usage-types";

const TASK_LABELS: Record<string, string> = {
  transcription: "Phiên âm",
  report: "Văn bản tổng hợp",
  chat: "Hỏi đáp",
  speaker_naming: "Đặt tên người nói",
  term_correction: "Hiệu đính thuật ngữ",
};

const num = new Intl.NumberFormat("vi-VN");
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
const fmt = (n: number) => (n >= 100_000 ? compact.format(n) : num.format(n));
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

function Figures({ r }: { r: UsageTotals }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
      <span>
        <span className="font-medium text-foreground">{num.format(r.calls)}</span> lượt gọi
      </span>
      <span>
        Vào <span className="font-medium text-foreground">{fmt(r.inputTokens)}</span> · cache{" "}
        <span className="font-medium text-foreground">{pct(r.cachedInputTokens, r.inputTokens)}</span>
      </span>
      <span>
        Ra <span className="font-medium text-foreground">{fmt(r.outputTokens)}</span>
      </span>
      <span>
        Suy luận <span className="font-medium text-foreground">{r.reasoningTokens ? fmt(r.reasoningTokens) : "0"}</span>
      </span>
    </div>
  );
}

/**
 * Token AI đã dùng theo mô hình / tác vụ: phần đầu vào đọc từ cache (rẻ hơn nhiều) và phần đầu ra dành cho
 * suy luận (tính giá đầu ra) — hai con số quyết định chi phí.
 */
export function UsageCard() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState<{ loading: boolean; data?: UsageSummary; error?: string }>({ loading: true });

  useEffect(() => {
    let alive = true;
    apiJson<UsageSummary>(`/api/admin/ai-usage?days=${days}`).then(
      (data) => alive && setState({ loading: false, data }),
      (e: Error) => alive && setState({ loading: false, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [days]);

  const data = state.data;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Chi phí AI (token)</CardTitle>
          <CardDescription>
            Token đầu vào đọc từ cache rẻ hơn nhiều lần; token suy luận (thinking) tính theo giá đầu ra. Đối chiếu hoá đơn ở trang
            quản lý của nhà cung cấp.
          </CardDescription>
        </div>
        <Select
          value={String(days)}
          onValueChange={(v) => {
            setState({ loading: true });
            setDays(Number(v));
          }}
        >
          <SelectTrigger size="sm" className="w-36 shrink-0" aria-label="Khoảng thời gian">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">24 giờ qua</SelectItem>
            <SelectItem value="7">7 ngày qua</SelectItem>
            <SelectItem value="30">30 ngày qua</SelectItem>
            <SelectItem value="90">90 ngày qua</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Đang tải…
          </div>
        ) : state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted-foreground">Chưa có lượt gọi AI nào trong khoảng thời gian này.</p>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 text-sm font-medium">Tổng cộng</div>
              <Figures r={data.total} />
            </div>
            <ul className="divide-y rounded-lg border">
              {data.rows.map((r) => (
                <li key={`${r.provider}-${r.model}-${r.task}`} className="space-y-1 p-3">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{TASK_LABELS[r.task] ?? r.task}</span>
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {PROVIDERS[r.provider as ProviderKind]?.label ?? r.provider} · {r.model}
                    </span>
                  </div>
                  <Figures r={r} />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
