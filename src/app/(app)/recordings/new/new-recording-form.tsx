"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronDownIcon, FileAudioIcon, MicIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Recorder, type RecordedAudio } from "@/components/recordings/recorder";
import { CATEGORIES } from "@/components/recordings/category";
import { ConnectionSelect } from "@/components/ai/connection-select";
import { useConnectionChoice, useConnections } from "@/components/ai/use-connections";
import { apiJson } from "@/lib/client/api";
import { readAudioDuration, uploadRecordingFile, type UploadProgress } from "@/lib/client/upload";
import { clearSession } from "@/lib/client/recorder-store";
import { DEFAULT_AUTO_TEMPLATE, SYSTEM_TEMPLATES } from "@/lib/reports/templates";
import { PROVIDERS } from "@/lib/ai/catalog";
import { formatDuration } from "@/lib/transcription/timecode";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.aac,.ogg,.opus,.flac,.webm,.amr,.wma,.mp4";

export function NewRecordingForm({ initialMode, storageReady = true }: { initialMode: "upload" | "record"; storageReady?: boolean }) {
  const router = useRouter();
  const profile = useProfile();
  const { state: conns } = useConnections();
  const [mode, setMode] = useState(initialMode);
  const [file, setFile] = useState<Blob & { name?: string } | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [recSession, setRecSession] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("giao_ban");
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const [transcribe, setTranscribe] = useState(true);
  const [connectionId, setConnectionId] = useConnectionChoice(conns, "transcription");
  const [autoReport, setAutoReport] = useState<string>(DEFAULT_AUTO_TEMPLATE.giao_ban);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chunkMinutes, setChunkMinutes] = useState("10");
  const [normalize, setNormalize] = useState("loudnorm");
  const [denoise, setDenoise] = useState(false);
  const [gapFill, setGapFill] = useState(true);
  const [nameSpeakers, setNameSpeakers] = useState(true);
  const [correctTerms, setCorrectTerms] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const createdIdRef = useRef<string | null>(null);

  function changeCategory(v: string) {
    setCategory(v);
    setAutoReport((prev) => (prev === "" ? "" : (DEFAULT_AUTO_TEMPLATE[v] ?? prev)));
  }

  const selectedConn = useMemo(() => conns?.connections.find((c) => c.id === connectionId), [conns, connectionId]);
  const isSoniox = selectedConn?.provider === "soniox";

  async function acceptFile(f: File) {
    setFile(f);
    setRecSession(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    if (f.lastModified) setMeetingDate(format(new Date(f.lastModified), "yyyy-MM-dd"));
    setDuration(await readAudioDuration(f));
  }

  function onRecorded(r: RecordedAudio) {
    setFile(r.blob);
    setDuration(r.durationSec || null);
    setRecSession(r.session);
    if (!title) setTitle(`Ghi âm ${format(new Date(), "dd/MM/yyyy HH:mm")}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Chọn tệp ghi âm hoặc ghi âm trước");
    if (!title.trim()) return toast.error("Nhập tiêu đề");
    setBusy(true);
    const supabase = createClient();
    try {
      let id = createdIdRef.current;
      if (!id) {
        const { data, error } = await supabase
          .from("recordings")
          .insert({
            owner_id: profile.id,
            title: title.trim(),
            category,
            meeting_date: meetingDate || null,
            location: location.trim() || null,
            participants: participants.trim() || null,
            description: description.trim() || null,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Không tạo được bản ghi");
        id = data.id;
        createdIdRef.current = id;
      }
      const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : "webm";
      const named = file.name ? file : Object.assign(file, { name: `${title.trim()}.${ext}` });
      abortRef.current = new AbortController();
      await uploadRecordingFile(id, named, setProgress, abortRef.current.signal);
      if (recSession) await clearSession(recSession).catch(() => {});

      if (transcribe) {
        await apiJson(`/api/recordings/${id}/transcribe`, {
          method: "POST",
          json: {
            connectionId,
            chunkMinutes: Number(chunkMinutes),
            normalize,
            denoise,
            gapFill,
            nameSpeakers,
            correctTerms: correctTerms ?? isSoniox,
            autoReportTemplate: autoReport || null,
          },
        }).catch((err) => toast.error(`Đã lưu tệp nhưng chưa bắt đầu phiên âm được: ${(err as Error).message}`));
      }
      toast.success(transcribe ? "Đã tải lên — đang phiên âm" : "Đã tải lên");
      router.push(`/recordings/${id}`);
    } catch (err) {
      if ((err as Error).name === "AbortError") toast.message("Đã huỷ tải lên");
      else toast.error((err as Error).message);
      setBusy(false);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Nguồn âm thanh</CardTitle>
            <CardDescription>Tệp gốc được lưu nguyên vẹn trên Google Drive của đơn vị, không nén lại.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "upload" | "record")}>
              <TabsList>
                <TabsTrigger value="upload" disabled={busy}>
                  <UploadCloudIcon /> Tải tệp lên
                </TabsTrigger>
                <TabsTrigger value="record" disabled={busy}>
                  <MicIcon /> Ghi âm
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <FileAudioIcon className="size-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{file.name ?? "Bản ghi âm mới"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} {duration ? `• ${formatDuration(duration)}` : ""} {file.type ? `• ${file.type}` : ""}
                  </div>
                </div>
                {!busy ? (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Bỏ tệp">
                    <XIcon />
                  </Button>
                ) : null}
              </div>
            ) : mode === "upload" ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) acceptFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${dragOver ? "border-primary bg-accent" : "hover:border-primary/50"}`}
              >
                <UploadCloudIcon className="size-10 text-primary" />
                <div className="font-medium">Kéo thả hoặc bấm để chọn tệp</div>
                <div className="text-xs text-muted-foreground">m4a (Voice Memos), mp3, wav, aac, ogg, flac, webm, mp4… tối đa 2 GB</div>
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFile(f);
                  }}
                />
              </label>
            ) : (
              <Recorder onComplete={onRecorded} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Thông tin cuộc họp</CardTitle>
            <CardDescription>Danh sách người tham dự giúp AI nhận diện đúng tên người nói.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Tiêu đề *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Giao ban GMHS – ca mổ cột sống thắt lưng" required />
            </div>
            <div className="space-y-1.5">
              <Label>Loại</Label>
              <Select value={category} onValueChange={changeCategory}>
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Ngày họp</Label>
              <Input id="date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="loc">Địa điểm</Label>
              <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="VD: Hội trường khoa GMHS" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="participants">Thành phần tham dự</Label>
              <Textarea
                id="participants"
                rows={3}
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="VD: Thầy Hiển (chủ tọa), BS Quang (nội trú, trình bày), BS Hào, BS Tuyến, BS Dương"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="desc">Ghi chú / chủ đề</Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Chủ đề, ca bệnh, nội dung chính (tuỳ chọn)" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tags">Nhãn (cách nhau bởi dấu phẩy)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cột sống, nằm sấp, ERAS" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>3. Xử lý bằng AI</CardTitle>
            <CardDescription>Có thể chạy lại với cấu hình khác sau.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tr">Phiên âm & phân vai ngay</Label>
              <Switch id="tr" checked={transcribe} onCheckedChange={setTranscribe} />
            </div>
            {transcribe ? (
              <>
                <div className="space-y-1.5">
                  <Label>Mô hình phiên âm</Label>
                  <ConnectionSelect state={conns} usage="transcription" value={connectionId} onChange={setConnectionId} />
                  {selectedConn ? (
                    <p className="text-xs text-muted-foreground">{PROVIDERS[selectedConn.provider].note}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label>Tự tạo văn bản sau khi phiên âm</Label>
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
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  Tuỳ chọn nâng cao
                  <ChevronDownIcon className={`size-4 transition ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
                {showAdvanced ? (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    {!isSoniox ? (
                      <div className="space-y-1.5">
                        <Label>Độ dài mỗi đoạn xử lý</Label>
                        <Select value={chunkMinutes} onValueChange={setChunkMinutes}>
                          <SelectTrigger className="w-full" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["5", "8", "10", "12", "15"].map((m) => (
                              <SelectItem key={m} value={m}>
                                {m} phút {m === "10" ? "(khuyên dùng)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Đoạn ngắn hơn giảm nguy cơ mô hình bỏ sót, nhưng tốn thêm lượt gọi.</p>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label>Chuẩn hoá âm lượng</Label>
                      <Select value={normalize} onValueChange={setNormalize}>
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="loudnorm">Chuẩn EBU R128 (mặc định)</SelectItem>
                          <SelectItem value="dynaudnorm">Tăng cường người nói xa micro</SelectItem>
                          <SelectItem value="none">Giữ nguyên</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Toggle label="Khử nhiễu (không khuyến nghị)" checked={denoise} onChange={setDenoise} hint="Khử nhiễu thường làm tăng lỗi nhận dạng giọng nói." />
                    {!isSoniox ? (
                      <Toggle label="Quét bổ sung khoảng bị bỏ sót" checked={gapFill} onChange={setGapFill} hint="So khớp với bản đồ tiếng nói, phiên âm lại đoạn thiếu." />
                    ) : null}
                    <Toggle label="Nhận diện tên người nói" checked={nameSpeakers} onChange={setNameSpeakers} />
                    <Toggle
                      label="Hiệu đính thuật ngữ bằng AI"
                      checked={correctTerms ?? isSoniox}
                      onChange={setCorrectTerms}
                      hint="Chỉ sửa tên thuốc/thuật ngữ nhận dạng sai; có kiểm chứng, không viết lại câu."
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {progress ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Đang tải lên Google Drive… {pct}%</span>
                  <span>{progress.speedBps ? `${formatBytes(progress.speedBps)}/s` : ""}</span>
                </div>
                <Progress value={pct} />
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" className="h-10 flex-1" disabled={busy || !file || !storageReady} title={storageReady ? undefined : "Chưa kết nối Google Drive"}>
                {busy ? "Đang xử lý…" : transcribe ? "Lưu & phiên âm" : "Lưu bản ghi"}
              </Button>
              {busy ? (
                <Button type="button" variant="outline" className="h-10" onClick={() => abortRef.current?.abort()}>
                  Huỷ
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
