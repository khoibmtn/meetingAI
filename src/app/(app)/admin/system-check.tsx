"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon, Loader2Icon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/client/api";

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Kiểm tra nhanh toàn hệ thống: CSDL, Google Drive, worker ffmpeg, kết nối AI cho từng vị trí. */
export function SystemCheck() {
  const [state, setState] = useState<{ loading: boolean; checks?: Check[]; error?: string }>({ loading: true });
  const [run, setRun] = useState(0);

  useEffect(() => {
    let alive = true;
    apiJson<{ checks: Check[] }>("/api/admin/diagnostics").then(
      ({ checks }) => alive && setState({ loading: false, checks }),
      (e: Error) => alive && setState({ loading: false, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [run]);

  const failed = state.checks?.filter((c) => !c.ok).length ?? 0;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Kiểm tra hệ thống</CardTitle>
          <CardDescription>
            {state.loading
              ? "Đang kiểm tra…"
              : state.checks
                ? failed
                  ? `${failed} mục cần xử lý trước khi phiên âm.`
                  : "Mọi thành phần sẵn sàng — có thể tải bản ghi lên để phiên âm."
                : "Không chạy được kiểm tra."}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={state.loading}
          onClick={() => {
            setState({ loading: true });
            setRun((n) => n + 1);
          }}
        >
          {state.loading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Kiểm tra lại
        </Button>
      </CardHeader>
      <CardContent>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <ul className="divide-y rounded-lg border">
          {(state.checks ?? []).map((c) => (
            <li key={c.key} className="flex items-start gap-3 p-3">
              {c.ok ? (
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" />
              ) : (
                <XCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <div className="font-medium">{c.label}</div>
                <div className="text-sm break-words text-muted-foreground">{c.detail}</div>
              </div>
            </li>
          ))}
          {state.loading && !state.checks ? (
            <li className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Đang kiểm tra CSDL, Google Drive, worker và kết nối AI…
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
