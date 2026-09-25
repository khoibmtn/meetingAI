"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "./category";
import { formatDuration } from "@/lib/transcription/timecode";
import type { TranscriptQuality } from "@/lib/transcription/types";
import { formatBytes } from "@/lib/utils";

export function InfoPanel({
  recording,
  canEdit,
  quality,
  engine,
  model,
}: {
  recording: Tables<"recordings">;
  canEdit: boolean;
  quality: TranscriptQuality | null;
  engine: string | null;
  model: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: recording.title,
    category: recording.category,
    meeting_date: recording.meeting_date ?? "",
    location: recording.location ?? "",
    participants: recording.participants ?? "",
    description: recording.description ?? "",
    tags: (recording.tags ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    const { error } = await createClient()
      .from("recordings")
      .update({
        title: form.title.trim() || recording.title,
        category: form.category,
        meeting_date: form.meeting_date || null,
        location: form.location.trim() || null,
        participants: form.participants.trim() || null,
        description: form.description.trim() || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      })
      .eq("id", recording.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Đã lưu thông tin");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        <Field label="Tiêu đề">
          <Input value={form.title} onChange={set("title")} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))} disabled={!canEdit}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ngày họp">
            <Input type="date" value={form.meeting_date} onChange={set("meeting_date")} disabled={!canEdit} />
          </Field>
        </div>
        <Field label="Địa điểm">
          <Input value={form.location} onChange={set("location")} disabled={!canEdit} />
        </Field>
        <Field label="Thành phần tham dự">
          <Textarea rows={3} value={form.participants} onChange={set("participants")} disabled={!canEdit} />
        </Field>
        <Field label="Ghi chú / chủ đề">
          <Textarea rows={2} value={form.description} onChange={set("description")} disabled={!canEdit} />
        </Field>
        <Field label="Nhãn">
          <Input value={form.tags} onChange={set("tags")} disabled={!canEdit} />
        </Field>
        {canEdit ? (
          <Button onClick={save} disabled={saving} className="justify-self-start">
            Lưu thông tin
          </Button>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
        <dt className="text-muted-foreground">Tệp gốc</dt>
        <dd className="truncate">{recording.original_filename ?? "—"}</dd>
        <dt className="text-muted-foreground">Dung lượng</dt>
        <dd>{formatBytes(recording.size_bytes)}</dd>
        <dt className="text-muted-foreground">Thời lượng</dt>
        <dd>{formatDuration(recording.duration_sec ? Number(recording.duration_sec) : null)}</dd>
        <dt className="text-muted-foreground">Định dạng</dt>
        <dd>{recording.mime_type ?? "—"}</dd>
        <dt className="text-muted-foreground">Tạo lúc</dt>
        <dd>{format(new Date(recording.created_at), "dd/MM/yyyy HH:mm")}</dd>
        {engine ? (
          <>
            <dt className="text-muted-foreground">Phiên âm bằng</dt>
            <dd>
              {engine === "soniox" ? "Soniox" : "Gemini"} · {model}
            </dd>
          </>
        ) : null}
      </dl>
      {quality ? <QualityCard quality={quality} /> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function QualityCard({ quality }: { quality: TranscriptQuality }) {
  const pct = Math.round((quality.coverageRatio ?? 0) * 1000) / 10;
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="font-medium">Kiểm soát chất lượng (không bỏ sót nội dung)</div>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          Độ phủ tiếng nói: <b className="text-foreground">{pct}%</b> ({Math.round(quality.coveredSpeechSec / 60)}/{Math.round(quality.speechSec / 60)} phút có tiếng nói đã có chữ)
        </li>
        <li>
          Quét bổ sung: {quality.gapFillsRecovered}/{quality.gapFillsAttempted} khoảng tìm lại được nội dung
        </li>
        <li>
          Đã loại {quality.duplicatesRemoved} câu trùng ở chỗ nối, {quality.repetitionsTrimmed} vòng lặp của mô hình
        </li>
        {quality.uncoveredGaps?.length ? (
          <li>Còn {quality.uncoveredGaps.length} khoảng ≥ 8 giây có âm thanh nhưng không có chữ (có thể là tiếng ồn, nhạc, hoặc nói nhỏ) — nên nghe lại.</li>
        ) : null}
      </ul>
      {quality.warnings?.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {quality.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
