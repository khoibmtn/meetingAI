"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  FileTextIcon,
  InfoIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  Trash2Icon,
} from "lucide-react";
import type { Tables } from "@/lib/database.types";
import type { Segment, Speaker, TranscriptQuality } from "@/lib/transcription/types";
import { formatDuration } from "@/lib/transcription/timecode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlayerProvider, usePlayer } from "@/components/player/player-context";
import { PlayerBar } from "@/components/player/player-bar";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { useProfile } from "@/components/profile-context";
import { apiJson } from "@/lib/client/api";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { categoryLabel } from "./category";
import { RecordingStatusBadge } from "./status-badge";
import { TranscriptView } from "./transcript-view";
import { JobProgress } from "./job-progress";
import { ReportsPanel, type CustomTemplate, type ReportItem } from "./reports-panel";
import { NotesPanel } from "./notes-panel";
import { InfoPanel, QualityCard } from "./info-panel";
import { ShareDialog } from "./share-dialog";
import { ExportMenu } from "./export-menu";
import { TranscribeDialog } from "./transcribe-dialog";
import { AudioMissingBar } from "./audio-missing-bar";
import { useTranscript } from "./use-transcript";

export interface WorkspaceProps {
  recording: Tables<"recordings">;
  transcript: {
    segments: Segment[];
    originalSegments: Segment[];
    speakers: Speaker[];
    version: number;
    quality: TranscriptQuality | null;
    engine: string | null;
    model: string | null;
  } | null;
  job: Tables<"transcription_jobs"> | null;
  reports: ReportItem[];
  customTemplates: CustomTemplate[];
  canEdit: boolean;
  isOwner: boolean;
  /** Đã kết nối Google Drive (tải tệp lên sau sẽ lưu lâu dài). */
  storageReady: boolean;
}

export function RecordingWorkspace(props: WorkspaceProps) {
  const src = props.recording.drive_file_id && props.recording.upload_status === "uploaded" ? `/api/recordings/${props.recording.id}/audio` : null;
  return (
    <PlayerProvider src={src} initialDuration={props.recording.duration_sec ? Number(props.recording.duration_sec) : null}>
      <WorkspaceInner {...props} />
    </PlayerProvider>
  );
}

const ACTIVE_JOB = ["queued", "preparing", "transcribing", "finalizing"];

function WorkspaceInner({ recording, transcript, job, reports, customTemplates, canEdit, isOwner, storageReady }: WorkspaceProps) {
  const router = useRouter();
  const params = useSearchParams();
  const profile = useProfile();
  const player = usePlayer();
  const t = useTranscript(
    recording.id,
    transcript ? { segments: transcript.segments, speakers: transcript.speakers, version: transcript.version } : null,
    profile.id,
  );
  const segments = useMemo(() => t.state?.segments ?? [], [t.state]);
  const speakers = useMemo(() => t.state?.speakers ?? [], [t.state]);
  const [tab, setTab] = useState(params.get("tab") ?? "reports");
  const [mobileTab, setMobileTab] = useState(params.get("tab") ?? "transcript");
  const [noteRequest, setNoteRequest] = useState<{ anchor?: number; content?: string; nonce: number } | null>(null);
  // Trạng thái tác vụ theo thời gian thực (JobProgress báo lên); đặt lại khi máy chủ gửi bản mới (router.refresh)
  const serverJobKey = job ? `${job.id}:${job.status}` : "";
  const [seenJobKey, setSeenJobKey] = useState(serverJobKey);
  const [liveJobStatus, setLiveJobStatus] = useState(job?.status ?? null);
  if (serverJobKey !== seenJobKey) {
    setSeenJobKey(serverJobKey);
    setLiveJobStatus(job?.status ?? null);
  }
  const jobRunning = !!liveJobStatus && ACTIVE_JOB.includes(liveJobStatus);
  const jobFailed = liveJobStatus === "error";
  // Tệp âm thanh: trên Drive (nghe lại được) hoặc giữ tạm để phiên âm (xoá khi xong)
  const onDrive = Boolean(recording.drive_file_id) && recording.upload_status === "uploaded";
  const temporary = recording.upload_status === "temporary";
  const canTranscribe = onDrive || temporary;
  // Vừa tải tệp lên để phiên âm (lại) → mở sẵn hộp thoại phiên âm
  const [autoTranscribe, setAutoTranscribe] = useState(0);
  // Chỉ dựng một bố cục (desktop hoặc di động) sau khi biết kích thước màn hình
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const showDesktop = isDesktop !== false;
  const showMobile = isDesktop !== true;

  // ?t=123 → tua tới giây 123 (từ trích dẫn ở trang nhóm/chat)
  useEffect(() => {
    const at = Number(params.get("t"));
    if (Number.isFinite(at) && at > 0 && player.ready) player.seek(at, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready]);

  function addNoteAt(seconds: number) {
    setNoteRequest({ anchor: Math.floor(seconds), nonce: Date.now() });
    setTab("notes");
    setMobileTab("notes");
  }

  function saveAnswerAsNote(content: string) {
    setNoteRequest({ content, nonce: Date.now() });
    setTab("notes");
    setMobileTab("notes");
    toast.message("Đã chuyển nội dung sang ô ghi chú — bấm “Thêm ghi chú” để lưu");
  }

  async function removeRecording() {
    if (!window.confirm(onDrive ? "Xoá bản ghi này? Tệp âm thanh trên Google Drive sẽ được chuyển vào Thùng rác." : "Xoá bản ghi này?")) return;
    try {
      await apiJson(`/api/recordings/${recording.id}`, { method: "DELETE" });
      toast.success("Đã xoá");
      router.push("/recordings");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const transcriptBlock = t.state && segments.length ? (
    <TranscriptView
      segments={segments}
      speakers={speakers}
      canEdit={canEdit}
      saving={t.saving}
      onUpdateSegment={t.updateSegment}
      onDeleteSegment={t.deleteSegment}
      onRenameSpeaker={t.renameSpeaker}
      onMergeSpeakers={t.mergeSpeakers}
      onConsolidateMinor={t.consolidateMinor}
      onAddSpeaker={t.addSpeaker}
      onAddNoteAt={addNoteAt}
    />
  ) : jobFailed ? (
    <EmptyState
      icon={<ScrollTextIcon />}
      title="Phiên âm chưa hoàn tất"
      description="Xem lỗi ở phía trên. Bấm “Thử lại” để xử lý tiếp các đoạn còn thiếu (giữ nguyên phần đã xong), hoặc “Phiên âm lại” với cấu hình khác."
    />
  ) : jobRunning ? (
    <div className="space-y-4 p-2" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Transcript sẽ tự hiện khi phiên âm xong — có thể rời trang, máy chủ vẫn xử lý.
      </p>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  ) : (
    <EmptyState
      icon={<ScrollTextIcon />}
      title={canTranscribe ? "Chưa có transcript" : recording.upload_status === "uploading" ? "Tệp âm thanh chưa tải lên xong" : "Chưa có tệp ghi âm"}
      description={
        canTranscribe
          ? "Bấm “Phiên âm” để AI chuyển âm thanh thành văn bản và phân vai người nói."
          : isOwner
            ? "Tải tệp ghi âm lên (thanh phía trên) để phiên âm."
            : "Người tạo bản ghi cần tải tệp ghi âm lên trước khi phiên âm."
      }
      action={canEdit && canTranscribe ? <TranscribeDialog recordingId={recording.id} hasTranscript={false} temporary={temporary} /> : undefined}
    />
  );

  const reportsBlock = (
    <ReportsPanel
      recordingId={recording.id}
      category={recording.category}
      recordingTitle={recording.title}
      initialReports={reports}
      customTemplates={customTemplates}
      canEdit={canEdit}
      onCite={(s) => player.seek(s)}
    />
  );
  const chatBlock = segments.length ? (
    <AiChatPanel recordingId={recording.id} onCite={(_src, s) => player.seek(s)} onSaveNote={saveAnswerAsNote} className="h-[min(70vh,720px)]" />
  ) : (
    <p className="py-6 text-center text-sm text-muted-foreground">Cần có transcript trước khi hỏi đáp.</p>
  );
  const notesBlock = <NotesPanel recordingId={recording.id} draftRequest={noteRequest} />;
  const infoBlock = (
    <InfoPanel recording={recording} canEdit={canEdit} quality={transcript?.quality ?? null} engine={transcript?.engine ?? null} model={transcript?.model ?? null} />
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 sm:px-6 lg:py-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Link href="/recordings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Bản ghi
          </Link>
          <h1 className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{recording.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Badge variant="outline">{categoryLabel(recording.category)}</Badge>
            <RecordingStatusBadge status={recording.status} uploadStatus={recording.upload_status} showStorage />
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-4" />
              {format(new Date(recording.meeting_date ?? recording.created_at), "dd/MM/yyyy")}
            </span>
            {recording.duration_sec ? (
              <span className="flex items-center gap-1">
                <ClockIcon className="size-4" />
                {formatDuration(Number(recording.duration_sec))}
              </span>
            ) : null}
            {recording.location ? (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-4" />
                {recording.location}
              </span>
            ) : null}
            {speakers.length ? <span>{speakers.length} người nói</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareDialog recordingId={recording.id} recordingTitle={recording.title} isOwner={isOwner} />
          <ExportMenu title={recording.title} segments={segments} speakers={speakers} />
          {canEdit && canTranscribe ? (
            <TranscribeDialog
              key={autoTranscribe}
              recordingId={recording.id}
              hasTranscript={segments.length > 0}
              disabled={jobRunning}
              temporary={temporary}
              defaultOpen={autoTranscribe > 0 && !jobRunning}
            />
          ) : null}
          {canEdit || isOwner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Thêm">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && transcript?.originalSegments?.length ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      window.confirm("Khôi phục transcript về bản máy gốc? Các chỉnh sửa sẽ mất.") && t.restoreOriginal(transcript.originalSegments)
                    }
                  >
                    <RotateCcwIcon /> Khôi phục bản máy gốc
                  </DropdownMenuItem>
                ) : null}
                {isOwner ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={removeRecording}>
                      <Trash2Icon /> Xoá bản ghi
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {job && (jobRunning || jobFailed) ? <JobProgress initialJob={job} canEdit={canEdit} onStatusChange={setLiveJobStatus} /> : null}
      {transcript?.quality && transcript.quality.coverageRatio < 0.9 && segments.length ? <QualityCard quality={transcript.quality} /> : null}
      {player.error ? <p className="text-sm text-destructive">{player.error}</p> : null}

      {onDrive ? (
        <PlayerBar segments={segments} speakers={speakers} className="sticky top-14 z-20 lg:top-2" />
      ) : (
        <AudioMissingBar
          recordingId={recording.id}
          uploadStatus={recording.upload_status}
          isOwner={isOwner}
          storageReady={storageReady}
          hasTranscript={segments.length > 0}
          jobRunning={jobRunning}
          jobFailed={jobFailed}
          onRequestTranscribe={() => setAutoTranscribe((n) => n + 1)}
        />
      )}

      {/* Desktop: 2 cột */}
      {showDesktop ? (
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <section className="min-w-0 rounded-xl border bg-card p-4">{transcriptBlock}</section>
        <aside className="min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="sticky top-20">
            <TabsList className="w-full">
              <TabsTrigger value="reports">
                <FileTextIcon /> Văn bản
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageSquareTextIcon /> Hỏi đáp
              </TabsTrigger>
              <TabsTrigger value="notes">
                <NotebookPenIcon /> Ghi chú
              </TabsTrigger>
              <TabsTrigger value="info">
                <InfoIcon />
              </TabsTrigger>
            </TabsList>
            <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto pt-2 pr-1">
              <TabsContent value="reports">{reportsBlock}</TabsContent>
              <TabsContent value="chat">{chatBlock}</TabsContent>
              <TabsContent value="notes">{notesBlock}</TabsContent>
              <TabsContent value="info">{infoBlock}</TabsContent>
            </div>
          </Tabs>
        </aside>
      </div>
      ) : null}

      {/* Di động: tab */}
      {showMobile ? (
      <Tabs value={mobileTab} onValueChange={setMobileTab} className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="reports">Văn bản</TabsTrigger>
          <TabsTrigger value="chat">Hỏi đáp</TabsTrigger>
          <TabsTrigger value="notes">Ghi chú</TabsTrigger>
          <TabsTrigger value="info" aria-label="Thông tin">
            <InfoIcon />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">{transcriptBlock}</TabsContent>
        <TabsContent value="reports">{reportsBlock}</TabsContent>
        <TabsContent value="chat">{chatBlock}</TabsContent>
        <TabsContent value="notes">{notesBlock}</TabsContent>
        <TabsContent value="info">{infoBlock}</TabsContent>
      </Tabs>
      ) : null}
    </div>
  );
}
