"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon, PencilIcon, PlugZapIcon, PlusIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/client/api";
import {
  effortBadgeLabel,
  PROVIDERS,
  USAGES,
  VERBOSITY_OPTIONS,
  usageAccepts,
  usageRejectReason,
  type ConnectionSummary,
  type Usage,
} from "@/lib/ai/catalog";
import { ConnectionEditor } from "./connection-editor";
import { useConnections } from "./use-connections";

/**
 * Quản lý kết nối AI và phân công theo vị trí sử dụng.
 *  - scope "org": trang Quản trị (kết nối dùng chung + phân công toàn hệ thống)
 *  - scope "user": trang Cài đặt cá nhân (kết nối riêng + phân công ghi đè cho bản thân)
 */
export function ConnectionsManager({ scope }: { scope: "org" | "user" }) {
  const { state, loading, error, reload } = useConnections();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectionSummary | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  if (loading && !state) return <Skeleton className="h-48" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!state) return null;

  const own = state.connections.filter((c) => (scope === "org" ? c.scope === "org" : c.mine));
  const canManage = scope === "user" || state.isAdmin;

  async function retest(c: ConnectionSummary) {
    setTestingId(c.id);
    try {
      const r = await apiJson<{
        ok: boolean;
        latencyMs: number;
        error?: string;
        fallback?: { model: string; ok: boolean; error?: string };
      }>("/api/ai/connections/test", {
        method: "POST",
        json: { id: c.id, provider: c.provider, baseUrl: c.baseUrl, model: c.model, params: c.params },
      });
      if (r.ok) toast.success(`${c.name}: hoạt động (${r.latencyMs} ms)`);
      else toast.error(`${c.name}: ${r.error}`);
      if (r.fallback && !r.fallback.ok) {
        toast.warning(`${c.name}: mô hình dự phòng ${r.fallback.model} không dùng được — ${r.fallback.error}`, { duration: 12_000 });
      }
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  async function remove(c: ConnectionSummary) {
    if (!window.confirm(`Xoá kết nối “${c.name}”? Các vị trí đang dùng kết nối này sẽ chuyển về mặc định.`)) return;
    try {
      await apiJson(`/api/ai/connections/${c.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function assign(usage: Usage, connectionId: string | null) {
    try {
      await apiJson("/api/ai/assignments", { method: "PUT", json: { scope, usage, connectionId } });
      toast.success("Đã cập nhật phân công");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const assignable = (usage: Usage) =>
    state.connections.filter(
      (c) => c.status === "ok" && usageAccepts(usage, c.provider) && (scope === "org" ? c.scope === "org" : true),
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{scope === "org" ? "Kết nối AI dùng chung" : "Kết nối AI cá nhân"}</CardTitle>
            <CardDescription>
              {scope === "org"
                ? "Mọi người trong đơn vị đều dùng được. Khoá API được mã hoá AES-256-GCM trên máy chủ."
                : "Dùng khoá API của riêng bạn (vd. tài khoản Claude/DeepSeek cá nhân). Chỉ bạn dùng được."}
            </CardDescription>
          </div>
          {canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <PlusIcon /> Thêm kết nối
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {own.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có kết nối. Thêm ít nhất một kết nối Gemini (để phiên âm) và kiểm tra kết nối thành công.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {own.map((c) => (
                <li key={c.id} className="flex min-w-0 flex-col gap-2 rounded-xl border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{c.model}</div>
                    </div>
                    <StatusBadge c={c} />
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1 text-xs">
                    <Badge variant="secondary">{PROVIDERS[c.provider].label}</Badge>
                    {c.keyHint ? <Badge variant="outline">Khoá {c.keyHint}</Badge> : null}
                    {c.baseUrl ? <Badge variant="outline" className="max-w-full truncate">{c.baseUrl}</Badge> : null}
                    {effortBadgeLabel(c.provider, c.params.effort) ? <Badge variant="muted">{effortBadgeLabel(c.provider, c.params.effort)}</Badge> : null}
                    {c.params.verbosity ? <Badge variant="muted">{VERBOSITY_OPTIONS.find((o) => o.value === c.params.verbosity)?.label}</Badge> : null}
                    {c.params.temperature != null ? <Badge variant="muted">T={c.params.temperature}</Badge> : null}
                    {c.params.fallbackModel ? (
                      c.params.fallbackModel === c.model ? (
                        <Badge variant="warning" title="Mô hình dự phòng phải khác mô hình chính — sửa kết nối để chọn mô hình khác">
                          Dự phòng trùng mô hình chính — không có tác dụng
                        </Badge>
                      ) : (
                        <Badge variant="muted">Dự phòng: {c.params.fallbackModel}</Badge>
                      )
                    ) : null}
                  </div>
                  {c.lastError ? (
                    <p className={`line-clamp-2 text-xs ${c.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      {c.status === "error" ? c.lastError : `Lần kiểm tra gần nhất gặp lỗi tạm thời (kết nối vẫn được dùng): ${c.lastError}`}
                    </p>
                  ) : null}
                  {canManage ? (
                    <div className="mt-auto flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => retest(c)} disabled={testingId === c.id}>
                        {testingId === c.id ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Kiểm tra
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(c);
                          setEditorOpen(true);
                        }}
                      >
                        <PencilIcon /> Sửa
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(c)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{scope === "org" ? "Phân công mô hình (toàn hệ thống)" : "Phân công mô hình của tôi"}</CardTitle>
          <CardDescription>
            Mỗi vị trí sử dụng AI chọn một kết nối trong danh sách kết nối đã kiểm tra thành công.
            {scope === "user" ? " Để “Theo hệ thống” nếu muốn dùng cấu hình chung của đơn vị." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-lg border">
            {USAGES.map((u) => {
              const options = assignable(u.id);
              // Kết nối không dùng được cho vị trí này: vẫn liệt kê (mờ) kèm lý do để khỏi thắc mắc vì sao không chọn được
              const unusable = state.connections.filter(
                (c) => !options.includes(c) && (scope === "org" ? c.scope === "org" : true),
              );
              const current = scope === "org" ? state.assignments.org[u.id] : state.assignments.mine[u.id];
              const orgCurrent = state.connections.find((c) => c.id === state.assignments.org[u.id]);
              return (
                <div key={u.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_minmax(0,320px)] sm:items-center">
                  <div>
                    <div className="font-medium">{u.label}</div>
                    <div className="text-xs text-muted-foreground">{u.description}</div>
                    {scope === "user" && orgCurrent ? (
                      <div className="text-xs text-muted-foreground">Hệ thống đang dùng: {orgCurrent.name}</div>
                    ) : null}
                  </div>
                  <Select
                    value={current && options.some((o) => o.id === current) ? current : "none"}
                    onValueChange={(v) => assign(u.id, v === "none" ? null : v)}
                    disabled={scope === "org" && !state.isAdmin}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{scope === "org" ? "Tự động (kết nối hợp lệ đầu tiên)" : "Theo hệ thống"}</SelectItem>
                      {options.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} · <span className="font-mono text-xs">{c.model}</span>
                        </SelectItem>
                      ))}
                      {unusable.map((c) => (
                        <SelectItem key={c.id} value={c.id} disabled>
                          <span className="min-w-0 truncate">
                            {c.name}{" "}
                            <span className="text-xs">
                              — {usageRejectReason(u.id, c.provider) ?? "chưa kiểm tra kết nối thành công"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {editorOpen ? (
        <ConnectionEditor
          key={editing?.id ?? "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          scope={editing?.scope ?? scope}
          existing={editing}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ c }: { c: ConnectionSummary }) {
  const when = c.lastTestedAt ? formatDistanceToNow(new Date(c.lastTestedAt), { addSuffix: true, locale: vi }) : null;
  if (c.status === "ok")
    return (
      <Badge variant="success" title={when ? `Kiểm tra ${when}` : undefined}>
        <CheckCircle2Icon /> Hoạt động{c.lastLatencyMs ? ` · ${c.lastLatencyMs} ms` : ""}
      </Badge>
    );
  if (c.status === "error")
    return (
      <Badge variant="destructive" title={when ?? undefined}>
        <XCircleIcon /> Lỗi
      </Badge>
    );
  return (
    <Badge variant="muted">
      <CircleDashedIcon /> Chưa kiểm tra
    </Badge>
  );
}
