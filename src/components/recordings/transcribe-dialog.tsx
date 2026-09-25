"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConnectionSelect } from "@/components/ai/connection-select";
import { useConnectionChoice, useConnections } from "@/components/ai/use-connections";
import { apiJson } from "@/lib/client/api";
import { SYSTEM_TEMPLATES } from "@/lib/reports/templates";

export function TranscribeDialog({ recordingId, hasTranscript, disabled }: { recordingId: string; hasTranscript: boolean; disabled?: boolean }) {
  const router = useRouter();
  const { state: conns } = useConnections();
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useConnectionChoice(conns, "transcription");
  const [chunkMinutes, setChunkMinutes] = useState("10");
  const [normalize, setNormalize] = useState("gain");
  const [gapFill, setGapFill] = useState(true);
  const [nameSpeakers, setNameSpeakers] = useState(true);
  const [correctTermsChoice, setCorrectTerms] = useState<boolean | null>(null);
  const [autoReport, setAutoReport] = useState("");
  const [busy, setBusy] = useState(false);
  const isSoniox = conns?.connections.find((c) => c.id === connectionId)?.provider === "soniox";
  const correctTerms = correctTermsChoice ?? isSoniox;

  async function start() {
    setBusy(true);
    try {
      await apiJson(`/api/recordings/${recordingId}/transcribe`, {
        method: "POST",
        json: {
          connectionId,
          chunkMinutes: Number(chunkMinutes),
          normalize,
          gapFill,
          nameSpeakers,
          correctTerms,
          autoReportTemplate: autoReport || null,
        },
      });
      toast.success("Đã bắt đầu phiên âm");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={hasTranscript ? "outline" : "default"} disabled={disabled}>
          <WandSparklesIcon /> {hasTranscript ? "Phiên âm lại" : "Phiên âm"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasTranscript ? "Phiên âm lại" : "Phiên âm & phân vai"}</DialogTitle>
          <DialogDescription>
            {hasTranscript
              ? "Transcript hiện tại (kể cả phần đã hiệu đính) sẽ được thay bằng kết quả mới. Tệp âm thanh gốc không thay đổi."
              : "Chọn mô hình và tuỳ chọn xử lý."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mô hình phiên âm</Label>
            <ConnectionSelect state={conns} usage="transcription" value={connectionId} onChange={setConnectionId} />
          </div>
          {!isSoniox ? (
            <div className="space-y-1.5">
              <Label>Độ dài mỗi đoạn</Label>
              <Select value={chunkMinutes} onValueChange={setChunkMinutes}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "8", "10", "12", "15"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} phút
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Chuẩn hoá âm lượng</Label>
            <Select value={normalize} onValueChange={setNormalize}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gain">Cân bằng âm lượng (mặc định)</SelectItem>
                <SelectItem value="dynaudnorm">Tăng cường người nói xa micro</SelectItem>
                <SelectItem value="none">Giữ nguyên</SelectItem>
              </SelectContent>
            </Select>
            {isSoniox ? (
              <p className="text-xs text-muted-foreground">Soniox nhận nguyên tệp gốc (m4a, mp3, wav…); tuỳ chọn này chỉ áp dụng khi phải chuyển định dạng.</p>
            ) : null}
          </div>
          {!isSoniox ? <Row label="Quét bổ sung khoảng bị bỏ sót" checked={gapFill} onChange={setGapFill} /> : null}
          <Row label="Nhận diện tên người nói" checked={nameSpeakers} onChange={setNameSpeakers} />
          <Row label="Hiệu đính thuật ngữ bằng AI" checked={correctTerms} onChange={setCorrectTerms} />
          <div className="space-y-1.5">
            <Label>Tự tạo văn bản sau khi xong</Label>
            <Select value={autoReport || "none"} onValueChange={(v) => setAutoReport(v === "none" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Không tạo</SelectItem>
                {SYSTEM_TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button onClick={start} disabled={busy || !connectionId}>
            Bắt đầu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
