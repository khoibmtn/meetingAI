"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  CopyIcon,
  FileDownIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const current = reports.find((r) => r.id === openId) ?? null;

  // Theo dõi báo cáo đang được tạo nền (tự động sau phiên âm)
  useEffect(() => {
    if (!reports.some((r) => r.status === "generating") || streaming) return;
    const t = window.setInterval(async () => {
      const { data } = await createClient()
        .from("reports")
        .select("id,title,template_key,status,is_shared,created_by,created_at,updated_at,provider,model")
        .eq("recording_id", recordingId)
        .order("created_at", { ascending: false });
      if (data) setReports(data);
      if (openId) {
        const { data: r } = await createClient().from("reports").select("content").eq("id", openId).maybeSingle();
        if (r) setContent(r.content);
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [reports, recordingId, openId, streaming]);

  async function open(id: string) {
    setOpenId(id);
    setEditing(false);
    const { data } = await createClient().from("reports").select("content").eq("id", id).maybeSingle();
    setContent(data?.content ?? "");
  }

  async function generate(templateKey: string, connectionId: string | undefined, isShared: boolean) {
    setGenOpen(false);
    setStreaming(true);
    setContent("");
    setEditing(false);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/recordings/${recordingId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, connectionId, isShared }),
        signal: abortRef.current.signal,
      });
      const id = res.headers.get("x-report-id");
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
        setReports((r) => [item, ...r]);
        setOpenId(id);
      }
      await readTextStream(res, setContent, abortRef.current.signal);
      setReports((r) => r.map((x) => (x.id === id ? { ...x, status: "ready" } : x)));
      toast.success("Đã tạo xong văn bản");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
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

  if (openId && current) {
    const canModify = current.created_by === profile.id || canEdit;
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
            <ArrowLeftIcon /> Danh sách
          </Button>
          <div className="min-w-0 flex-1 truncate font-semibold">{current.title}</div>
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
        {editing ? (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[60vh] font-mono text-sm" />
        ) : (
          <div id="report-print" className="rounded-xl border bg-card p-4 sm:p-6">
            {content ? <Markdown onCite={(_c, s) => onCite(s)}>{content}</Markdown> : null}
            {streaming || current.status === "generating" ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> AI đang soạn văn bản…
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setGenOpen(true)} className="w-full">
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
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} category={category} customTemplates={customTemplates} onGenerate={generate} />
    </div>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  category,
  customTemplates,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: string;
  customTemplates: CustomTemplate[];
  onGenerate: (templateKey: string, connectionId: string | undefined, isShared: boolean) => void;
}) {
  const { state: conns } = useConnections();
  const templates = useMemo(() => templatesForCategory(category), [category]);
  const [selected, setSelected] = useState(templates[0]?.key);
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
