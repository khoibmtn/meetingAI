"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, DownloadCloudIcon, EyeIcon, EyeOffIcon, Loader2Icon, PlugZapIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiJson } from "@/lib/client/api";
import {
  claudeAllowsSampling,
  EFFORT_OPTIONS,
  PARAM_PRESETS,
  PROVIDER_ORDER,
  PROVIDERS,
  VERBOSITY_OPTIONS,
  type ConnectionSummary,
  type Effort,
  type ModelParams,
  type ProviderKind,
  type Verbosity,
} from "@/lib/ai/catalog";
import { cn } from "@/lib/utils";

interface TestResult {
  ok: boolean;
  latencyMs: number;
  sample?: string;
  error?: string;
}

interface ModelItem {
  id: string;
  label?: string;
  description?: string;
}

/**
 * Tạo/sửa một kết nối AI: chọn nhà cung cấp, base URL, API key, tải danh sách mô hình hiện có
 * từ API (hoặc tự nhập), tinh chỉnh tham số, kiểm tra kết nối trước/sau khi lưu.
 */
export function ConnectionEditor({
  open,
  onOpenChange,
  scope,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: "org" | "user";
  existing?: ConnectionSummary | null;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<ProviderKind>(existing?.provider ?? "gemini");
  const [name, setName] = useState(existing?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(existing?.model ?? PROVIDERS[existing?.provider ?? "gemini"].suggestedModels[0] ?? "");
  const [params, setParams] = useState<ModelParams>(existing?.params ?? {});
  const [extraText, setExtraText] = useState(existing?.params?.extra ? JSON.stringify(existing.params.extra, null, 2) : "");
  const [models, setModels] = useState<ModelItem[] | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const info = PROVIDERS[provider];
  const samplingBlocked = provider === "anthropic" && !claudeAllowsSampling(model);

  function changeProvider(p: ProviderKind) {
    setProvider(p);
    setModels(null);
    setResult(null);
    setModel(PROVIDERS[p].suggestedModels[0] ?? "");
    if (!existing) setBaseUrl("");
  }

  function parsedExtra(): Record<string, unknown> | null | "invalid" {
    if (!extraText.trim()) return null;
    try {
      const v = JSON.parse(extraText);
      return v && typeof v === "object" && !Array.isArray(v) ? v : "invalid";
    } catch {
      return "invalid";
    }
  }

  function payload() {
    const extra = parsedExtra();
    if (extra === "invalid") throw new Error("Tham số nâng cao phải là một đối tượng JSON hợp lệ");
    return {
      id: existing?.id,
      scope,
      name: name.trim() || `${info.label} – ${model}`,
      provider,
      baseUrl: baseUrl.trim() || null,
      apiKey: apiKey.trim() || null,
      model: model.trim(),
      params: { ...params, extra },
    };
  }

  async function loadModels() {
    setLoadingModels(true);
    try {
      const res = await apiJson<{ models: ModelItem[] }>("/api/ai/models", {
        method: "POST",
        json: { id: existing?.id, provider, baseUrl: baseUrl.trim() || null, apiKey: apiKey.trim() || null },
      });
      setModels(res.models);
      if (!res.models.length) toast.message("Nhà cung cấp không trả về mô hình nào — hãy nhập tên mô hình thủ công.");
      else if (!model || !res.models.some((m) => m.id === model)) setModel(res.models[0].id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  }

  async function test(p = payload()) {
    setTesting(true);
    setResult(null);
    try {
      const r = await apiJson<TestResult>("/api/ai/connections/test", { method: "POST", json: p });
      setResult(r);
      return r;
    } catch (e) {
      const r = { ok: false, latencyMs: 0, error: (e as Error).message };
      setResult(r);
      return r;
    } finally {
      setTesting(false);
    }
  }

  async function saveAndTest() {
    let p;
    try {
      p = payload();
    } catch (e) {
      return toast.error((e as Error).message);
    }
    if (!p.model) return toast.error("Chọn hoặc nhập tên mô hình");
    if (!existing && !p.apiKey) return toast.error("Nhập API key");
    setSaving(true);
    try {
      const { connection } = await apiJson<{ connection: ConnectionSummary }>("/api/ai/connections", { method: "POST", json: p });
      // Kiểm tra ngay kết nối đã lưu (ghi nhận trạng thái hợp lệ)
      const r = await test({ ...p, id: connection.id, apiKey: null });
      if (r.ok) toast.success("Đã lưu — kết nối hoạt động tốt");
      else toast.warning("Đã lưu nhưng kiểm tra kết nối thất bại — xem chi tiết lỗi");
      onSaved();
      if (r.ok) onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filteredModels = useMemo(() => {
    if (!models) return [];
    const q = modelFilter.trim().toLowerCase();
    return q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.label?.toLowerCase().includes(q)) : models;
  }, [models, modelFilter]);

  const setP = <K extends keyof ModelParams>(k: K, v: ModelParams[K]) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Sửa kết nối AI" : "Thêm kết nối AI"}</DialogTitle>
          <DialogDescription>
            {scope === "org" ? "Kết nối dùng chung cho toàn đơn vị." : "Kết nối cá nhân — chỉ bạn dùng được."} Khoá API được mã hoá và
            không bao giờ gửi về trình duyệt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Nhà cung cấp */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROVIDER_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changeProvider(p)}
                disabled={!!existing && existing.provider !== p}
                className={cn(
                  "rounded-lg border p-2.5 text-left text-sm transition disabled:opacity-40",
                  provider === p ? "border-primary bg-accent" : "hover:border-primary/40",
                )}
              >
                <div className="font-medium">{PROVIDERS[p].label}</div>
                <div className="text-xs text-muted-foreground">{PROVIDERS[p].kind === "asr" ? "Phiên âm" : PROVIDERS[p].audioInput ? "Văn bản + âm thanh" : "Văn bản"}</div>
              </button>
            ))}
          </div>
          {info.note ? <p className="text-xs text-muted-foreground">{info.note}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tên kết nối</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${info.label} – ${model || "mô hình"}`} />
            </div>
            <div className="space-y-1.5">
              <Label>Base URL {provider === "openai_compatible" ? "*" : "(tuỳ chọn)"}</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.defaultBaseUrl} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center justify-between">
                <span>API key {existing ? "" : "*"}</span>
                {info.keyUrl ? (
                  <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-xs font-normal text-primary hover:underline">
                    Lấy API key →
                  </a>
                ) : null}
              </Label>
              <div className="flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={existing?.keyHint ? `Giữ nguyên khoá hiện tại (${existing.keyHint})` : info.keyPlaceholder}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((s) => !s)} aria-label="Hiện/ẩn khoá">
                  {showKey ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </div>
            </div>
          </div>

          {/* Mô hình */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Mô hình</Label>
              <Button type="button" size="sm" variant="outline" onClick={loadModels} disabled={loadingModels || (!apiKey && !existing)}>
                {loadingModels ? <Loader2Icon className="animate-spin" /> : <DownloadCloudIcon />} Tải danh sách mô hình
              </Button>
            </div>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Nhập ID mô hình, vd gemini-3.8-flash" className="font-mono text-sm" />
            {models ? (
              <div className="space-y-1.5">
                <Input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder={`Lọc ${models.length} mô hình…`} className="h-8 text-sm" />
                <div className="max-h-44 overflow-y-auto rounded-md border">
                  {filteredModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={cn("flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent", model === m.id && "bg-accent")}
                    >
                      <span className="font-mono">{m.id}</span>
                      {m.label && m.label !== m.id ? <span className="truncate text-xs text-muted-foreground">{m.label}</span> : null}
                    </button>
                  ))}
                  {filteredModels.length === 0 ? <div className="p-2 text-xs text-muted-foreground">Không có — dùng tên đã nhập.</div> : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {info.suggestedModels.map((m) => (
                  <button key={m} type="button" onClick={() => setModel(m)} className="rounded-full border px-2 py-0.5 font-mono text-xs hover:border-primary/50">
                    {m}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground">— hoặc bấm “Tải danh sách mô hình” để lấy các phiên bản mới nhất.</span>
              </div>
            )}
          </div>

          {/* Tham số */}
          {info.kind === "llm" ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Tham số mô hình</Label>
                <div className="flex gap-1">
                  {PARAM_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      title={p.description}
                      onClick={() => setParams((cur) => ({ ...cur, ...p.params }))}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {info.supports.effort ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mức suy luận (độ chính xác ↔ tốc độ)</Label>
                    <Select value={params.effort ?? "default"} onValueChange={(v) => setP("effort", v === "default" ? null : (v as Effort))}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Mặc định của mô hình</SelectItem>
                        {EFFORT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label className="text-xs">Độ chi tiết câu trả lời</Label>
                  <Select value={params.verbosity ?? "default"} onValueChange={(v) => setP("verbosity", v === "default" ? null : (v as Verbosity))}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định</SelectItem>
                      {VERBOSITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SliderParam
                  label="Temperature (độ sáng tạo)"
                  value={params.temperature}
                  min={0}
                  max={2}
                  step={0.05}
                  defaultValue={0.3}
                  disabledNote={samplingBlocked ? "Mô hình này không hỗ trợ — sẽ bỏ qua" : undefined}
                  onChange={(v) => setP("temperature", v)}
                />
                <SliderParam label="Top-p" value={params.topP} min={0} max={1} step={0.05} defaultValue={0.95} disabledNote={samplingBlocked ? "Không hỗ trợ" : undefined} onChange={(v) => setP("topP", v)} />
                <div className="space-y-1.5">
                  <Label className="text-xs">Số token đầu ra tối đa</Label>
                  <Input
                    type="number"
                    min={256}
                    step={256}
                    value={params.maxOutputTokens ?? ""}
                    onChange={(e) => setP("maxOutputTokens", e.target.value ? Number(e.target.value) : null)}
                    placeholder="Mặc định (theo tác vụ)"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tham số nâng cao (JSON, gửi kèm nguyên văn)</Label>
                <Textarea
                  value={extraText}
                  onChange={(e) => setExtraText(e.target.value)}
                  placeholder={'{ "seed": 42 }'}
                  rows={2}
                  className={cn("font-mono text-xs", parsedExtra() === "invalid" && "border-destructive")}
                />
              </div>
            </div>
          ) : null}

          {result ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm",
                result.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10",
              )}
            >
              {result.ok ? <CheckCircle2Icon className="mt-0.5 size-4 text-success" /> : <XCircleIcon className="mt-0.5 size-4 text-destructive" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {result.ok ? `Kết nối thành công (${result.latencyMs} ms)` : "Kết nối thất bại"}
                </div>
                <div className="text-xs break-words text-muted-foreground">{result.ok ? `Phản hồi: ${result.sample}` : result.error}</div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => test().catch(() => {})} disabled={testing || saving || (!apiKey && !existing)}>
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Kiểm tra kết nối
          </Button>
          <Button type="button" onClick={saveAndTest} disabled={saving || testing}>
            {saving ? <Loader2Icon className="animate-spin" /> : null} Lưu & kiểm tra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SliderParam({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  disabledNote,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  disabledNote?: string;
  onChange: (v: number | null) => void;
}) {
  const custom = value !== null && value !== undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Tuỳ chỉnh <Switch checked={custom} onCheckedChange={(c) => onChange(c ? defaultValue : null)} />
        </label>
      </div>
      {custom ? (
        <div className="flex items-center gap-2">
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
          <span className="w-10 text-right font-mono text-xs">{value}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Mặc định của mô hình</div>
      )}
      {disabledNote && custom ? <div className="text-xs text-warning">{disabledNote}</div> : null}
    </div>
  );
}
