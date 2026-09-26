"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CopyIcon,
  FileDownIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  SaveIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/markdown/markdown";
import { ConnectionSelect } from "@/components/ai/connection-select";
import { useConnectionChoice, useConnections } from "@/components/ai/use-connections";
import { useProfile } from "@/components/profile-context";
import { templatesForCategory } from "@/lib/reports/templates";
import { downloadBlob, readTextStream, safeFilename } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface ReportItem {
  id: string;
  title: string;
  template_key: string | null;
  status: string;
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  provider: string | null;
  model: string | null;
  author?: string | null;
}

const REPORT_FIELDS = "id,title,template_key,status,is_shared,created_by,created_at,updated_at,provider,model";

/** Danh sách mới từ máy chủ thay danh sách đang có (giữ tên tác giả đã biết). */
function mergeReports(current: ReportItem[], incoming: ReportItem[]): ReportItem[] {
  const authors = new Map(current.map((r) => [r.id, r.author]));
  return incoming.map((r) => ({ ...r, author: r.author ?? authors.get(r.id) ?? null }));
}

const REPORT_ERROR_RE = /\n*> ⚠️ Lỗi khi tạo báo cáo: (.+)\s*$/;

/** Thông báo lỗi ở cuối nội dung văn bản tạo thất bại. */
function reportErrorMessage(content: string): string | null {
  return REPORT_ERROR_RE.exec(content)?.[1]?.trim() ?? null;
}

export interface CustomTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

export function ReportsPanel({
  recordingId,
  category,
  recordingTitle,
  initialReports,
  customTemplates,
  canEdit,
  onCite,
}: {
  recordingId: string;
  category: string;
  recordingTitle: string;
  initialReports: ReportItem[];
  customTemplates: CustomTemplate[];
  canEdit: boolean;
  onCite: (seconds: number) => void;
}) {
  const profile = useProfile();
  const [reports, setReports] = useState(initialReports);
  // Máy chủ gửi danh sách mới (router.refresh sau khi phiên âm xong…) → cập nhật ngay, không cần tải lại trang
  const [prevInitial, setPrevInitial] = useState(initialReports);
  if (prevInitial !== initialReports) {
    setPrevInitial(initialReports);
    setReports((cur) => mergeReports(cur, initialReports));
  }
  // Mở hộp thoại tạo văn bản (tuỳ chọn: chọn sẵn template, thay thế văn bản lỗi)
  const [genPreset, setGenPreset] = useState<{ templateKey: string | null; replaceId: string | null; n: number }>({
    templateKey: null,
    replaceId: null,
    n: 0,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const current = reports.find((r) => r.id === openId) ?? null;

  // Danh sách văn bản cập nhật trực tiếp: văn bản tạo tự động sau phiên âm, người khác tạo, đổi trạng thái…
  // Realtime là chính; thăm dò 10 giây/lần làm dự phòng.
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const refresh = async () => {
      const { data } = await supabase
        .from("reports")
        .select(REPORT_FIELDS)
        .eq("recording_id", recordingId)
        .order("created_at", { ascending: false });
      if (alive && data) setReports((cur) => mergeReports(cur, data));
    };
    const channel = supabase
      .channel(`reports-${recordingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `recording_id=eq.${recordingId}` }, () => {
        void refresh();
      })
      .subscribe();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [recordingId]);

  // Văn bản đang mở: tải lại nội dung khi trạng thái đổi; đang tạo nền thì cập nhật dần mỗi 4 giây
  const openStatus = current?.status;
  useEffect(() => {
    if (!openId || streaming) return;
    let alive = true;
    const load = async () => {
      const { data } = await createClient().from("reports").select("content").eq("id", openId).maybeSingle();
      if (alive && data) setContent(data.content);
    };
    void load();
    const t = openStatus === "generating" ? window.setInterval(load, 4000) : null;
    return () => {
      alive = false;
      if (t) window.clearInterval(t);
    };
  }, [openId, openStatus, streaming]);

  async function open(id: string) {
    setOpenId(id);
    setEditing(false);
    const { data } = await createClient().from("reports").select("content").eq("id", id).maybeSingle();
    setContent(data?.content ?? "");
  }

  function openGenerate(templateKey: string | null = null, replaceId: string | null = null) {
    setGenPreset((p) => ({ templateKey, replaceId, n: p.n + 1 }));
    setGenOpen(true);
  }

  async function generate(templateKey: string, connectionId: string | undefined, isShared: boolean) {
    const replaceId = genPreset.replaceId;
    setGenOpen(false);
    setStreaming(true);
    setContent("");
    setEditing(false);
    abortRef.current = new AbortController();
    let id: string | null = null;
    try {
      const res = await fetch(`/api/recordings/${recordingId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, connectionId, isShared }),
        signal: abortRef.current.signal,
      });
      id = res.headers.get("x-report-id");
      if (id) {
        const tpl = [...templatesForCategory(category), ...customTemplates.map((c) => ({ key: c.id, name: c.name }))].find(
          (t) => t.key === templateKey,
        );
        const item: ReportItem = {
          id,
          title: tpl?.name ?? "Báo cáo",
          template_key: templateKey,
          status: "generating",
          is_shared: isShared,
          created_by: profile.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          provider: null,
          model: null,
          author: profile.full_name,
        };
        setReports((r) => [item, ...r.filter((x) => x.id !== replaceId)]);
        setOpenId(id);
        // "Tạo lại" từ một văn bản lỗi: bản lỗi không còn giá trị → xoá
        if (replaceId) void createClient().from("reports").delete().eq("id", replaceId).eq("status", "error");
      }
      await readTextStream(res, setContent, abortRef.current.signal);
      setReports((r) => r.map((x) => (x.id === id ? { ...x, status: "ready" } : x)));
      toast.success("Đã tạo xong văn bản");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error((e as Error).message);
        // Máy chủ đã ghi lỗi vào văn bản trước khi báo → hiện ngay thẻ lỗi (Tạo lại / Xoá)
        if (id) setReports((r) => r.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
      }
    } finally {
      setStreaming(false);
    }
  }

  async function saveEdit() {
    if (!current) return;
    const { error } = await createClient().from("reports").update({ content: draft }).eq("id", current.id);
    if (error) return toast.error(error.message);
    setContent(draft);
    setEditing(false);
    toast.success("Đã lưu");
  }

  async function remove(id: string) {
    if (!window.confirm("Xoá văn bản này?")) return;
    const { error } = await createClient().from("reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setReports((r) => r.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  async function exportDocx() {
    if (!current) return;
    const { markdownToDocxBlob } = await import("@/lib/export/docx");
    const blob = await markdownToDocxBlob(content, current.title);
    downloadBlob(blob, `${safeFilename(`${current.title} - ${recordingTitle}`)}.docx`);
  }

  function printReport() {
    const w = window.open("", "_blank");
    const el = document.getElementById("report-print");
    if (!w || !el) return;
    w.document.write(
      `<html><head><title>${escapeHtml(current?.title ?? "")}</title><style>body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.4;margin:20mm 15mm 20mm 30mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}h1{text-align:center;font-size:14pt}</style></head><body>${el.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const generateDialog = (
    <GenerateDialog
      key={genPreset.n}
      open={genOpen}
      onOpenChange={setGenOpen}
      category={category}
      customTemplates={customTemplates}
      initialTemplate={genPreset.templateKey}
      onGenerate={generate}
    />
  );

  if (openId && current) {
    const canModify = current.created_by === profile.id || canEdit;
    // Văn bản lỗi: thông báo lỗi đã nằm trong thẻ cảnh báo → thân văn bản chỉ còn phần đã soạn được (nếu có)
    const failed = current.status === "error" && !streaming;
    const shown = failed ? content.replace(REPORT_ERROR_RE, "").trim() : content;
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-start gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setOpenId(null)} aria-label="Về danh sách văn bản" title="Về danh sách">
            <ArrowLeftIcon />
          </Button>
          <div className="min-w-0 flex-1 pt-1 leading-snug font-semibold">{current.title}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {streaming ? (
            <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
              <SquareIcon /> Dừng xem trực tiếp
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={exportDocx} disabled={!content}>
                <FileDownIcon /> DOCX
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Khác
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigator.clipboard.writeText(content).then(() => toast.success("Đã sao chép"))}>
                    <CopyIcon /> Sao chép Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadBlob(new Blob([content], { type: "text/markdown" }), `${safeFilename(current.title)}.md`)}>
                    <FileTextIcon /> Tải .md
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={printReport}>
                    <PrinterIcon /> In / Lưu PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openGenerate(current.template_key)}>
                    <RefreshCwIcon /> Tạo lại (bản mới)
                  </DropdownMenuItem>
                  {canModify ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(current.id)}>
                      <Trash2Icon /> Xoá
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              {canModify ? (
                editing ? (
                  <Button size="sm" onClick={saveEdit}>
                    <SaveIcon /> Lưu
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraft(content);
                      setEditing(true);
                    }}
                  >
                    <PencilIcon /> Sửa
                  </Button>
                )
              ) : null}
            </>
          )}
        </div>
        {failed ? (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <div className="font-medium text-destructive">Tạo văn bản thất bại</div>
                <div className="break-words text-muted-foreground">{reportErrorMessage(content) ?? "Mô hình AI báo lỗi khi soạn văn bản."}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openGenerate(current.template_key, canModify ? current.id : null)}>
                <RefreshCwIcon /> Tạo lại
              </Button>
              {canModify ? (
                <Button size="sm" variant="outline" onClick={() => remove(current.id)}>
                  <Trash2Icon /> Xoá
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {editing ? (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[60vh] font-mono text-sm" />
        ) : failed && !shown ? null : (
          <div id="report-print" className="rounded-xl border bg-card p-4 sm:p-6">
            {shown ? <Markdown onCite={(_c, s) => onCite(s)}>{shown}</Markdown> : null}
            {streaming || current.status === "generating" ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> AI đang soạn văn bản…
              </div>
            ) : null}
          </div>
        )}
        {generateDialog}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => openGenerate()} className="w-full">
        <PlusIcon /> Tạo văn bản tổng hợp
      </Button>
      {reports.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Chưa có văn bản nào. Chọn template (giao ban, biên bản NĐ 30, hội nghị…) để AI soạn từ transcript.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id}>
              <button onClick={() => open(r.id)} className="flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40">
                <FileTextIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")} {r.author ? `• ${r.author}` : ""} {r.model ? `• ${r.model}` : ""}
                  </div>
                </div>
                {r.status === "generating" ? (
                  <Badge variant="secondary">
                    <Loader2Icon className="animate-spin" /> Đang tạo
                  </Badge>
                ) : r.status === "error" ? (
                  <Badge variant="destructive">Lỗi</Badge>
                ) : !r.is_shared ? (
                  <Badge variant="muted">Riêng tư</Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {generateDialog}
    </div>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  category,
  customTemplates,
  initialTemplate,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: string;
  customTemplates: CustomTemplate[];
  /** Chọn sẵn template (khi "Tạo lại"). */
  initialTemplate?: string | null;
  onGenerate: (templateKey: string, connectionId: string | undefined, isShared: boolean) => void;
}) {
  const { state: conns } = useConnections();
  const templates = useMemo(() => templatesForCategory(category), [category]);
  const [selected, setSelected] = useState(initialTemplate ?? templates[0]?.key);
  const [connectionId, setConnectionId] = useConnectionChoice(conns, "report");
  const [isShared, setIsShared] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo văn bản tổng hợp</DialogTitle>
          <DialogDescription>AI soạn văn bản dựa hoàn toàn trên transcript; bạn có thể chỉnh sửa và xuất DOCX.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1">
          {templates.map((t) => (
            <TemplateOption key={t.key} active={selected === t.key} onClick={() => setSelected(t.key)} name={t.name} description={t.description} suggested={t.categories.includes(category)} />
          ))}
          {customTemplates.length ? <div className="pt-2 text-xs font-semibold text-muted-foreground uppercase">Template tuỳ chỉnh</div> : null}
          {customTemplates.map((t) => (
            <TemplateOption key={t.id} active={selected === t.id} onClick={() => setSelected(t.id)} name={t.name} description={t.description ?? ""} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Mô hình AI</Label>
            <ConnectionSelect state={conns} usage="report" value={connectionId} onChange={setConnectionId} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Chia sẻ với người xem bản ghi</div>
              <div className="text-xs text-muted-foreground">Tắt để chỉ mình bạn thấy</div>
            </div>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button disabled={!selected || !connectionId} onClick={() => selected && onGenerate(selected, connectionId, isShared)}>
            Tạo văn bản
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function TemplateOption({ active, onClick, name, description, suggested }: { active: boolean; onClick: () => void; name: string; description: string; suggested?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-lg border p-3 text-left transition", active ? "border-primary bg-accent" : "hover:border-primary/40")}
    >
      <div className="flex items-center gap-2 font-medium">
        {name}
        {suggested ? <Badge variant="secondary">Gợi ý</Badge> : null}
      </div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </button>
  );
}
