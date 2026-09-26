"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudOffIcon, HourglassIcon, UploadCloudIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadRecordingFile, type UploadProgress, type UploadTarget } from "@/lib/client/upload";
import { TEMP_AUDIO_MAX_BYTES, TEMP_AUDIO_TTL_DAYS } from "@/lib/audio/limits";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.aac,.ogg,.opus,.flac,.webm,.amr,.wma,.mp4";

/**
 * Thay cho trình phát khi bản ghi không có tệp trên Google Drive:
 *  - "temporary": tệp đang được giữ tạm để phiên âm (tự xoá khi xong);
 *  - "discarded"/"pending"/"failed"/"uploading": chưa có tệp — người tạo có thể tải lên sau
 *    (lên Drive nếu đã kết nối, nếu không thì giữ tạm để phiên âm lại).
 */
export function AudioMissingBar({
  recordingId,
  uploadStatus,
  isOwner,
  storageReady,
  hasTranscript,
  jobRunning,
  jobFailed,
  onRequestTranscribe,
  className,
}: {
  recordingId: string;
  uploadStatus: string;
  isOwner: boolean;
  storageReady: boolean;
  hasTranscript: boolean;
  jobRunning: boolean;
  jobFailed: boolean;
  onRequestTranscribe: () => void;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<UploadTarget>("drive");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const limit = formatBytes(TEMP_AUDIO_MAX_BYTES);
  const tooBigForTemp = !!file && file.size > TEMP_AUDIO_MAX_BYTES;

  async function upload(f: File, dest: UploadTarget) {
    if (dest === "temp" && f.size > TEMP_AUDIO_MAX_BYTES) {
      toast.error(`Tệp lớn hơn ${limit} — cần kết nối Google Drive để lưu và phiên âm tệp này`);
      return;
    }
    setFile(f);
    setTarget(dest);
    setDriveError(null);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      await uploadRecordingFile(recordingId, f, setProgress, abortRef.current.signal, dest);
      if (dest === "temp" || !hasTranscript) {
        toast.success(dest === "temp" ? "Đã nhận tệp — chọn cấu hình để phiên âm" : "Đã lưu tệp ghi âm lên Google Drive");
        onRequestTranscribe();
      } else {
        toast.success("Đã lưu tệp ghi âm lên Google Drive — có thể nghe lại theo từng câu", {
          action: { label: "Phiên âm lại", onClick: onRequestTranscribe },
          duration: 10_000,
        });
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      if ((err as Error).name === "AbortError") toast.message("Đã huỷ tải lên");
      else if (dest === "drive") setDriveError((err as Error).message);
      else toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const temporary = uploadStatus === "temporary";
  const canUpload = isOwner && !temporary;
  const title = temporary
    ? "Tệp tạm — không lưu sau khi phiên âm"
    : uploadStatus === "discarded"
      ? "Không lưu tệp ghi âm"
      : uploadStatus === "uploading"
        ? "Tải tệp lên bị gián đoạn"
        : "Chưa có tệp ghi âm";
  const description = temporary
    ? jobRunning
      ? "Tệp được giữ tạm trong lúc phiên âm và sẽ tự xoá khi xong."
      : jobFailed
        ? `Tệp tạm được giữ lại để “Thử lại” hoặc phiên âm với cấu hình khác (tự xoá sau ${TEMP_AUDIO_TTL_DAYS} ngày).`
        : `Tệp đang được giữ tạm để phiên âm (tự xoá sau ${TEMP_AUDIO_TTL_DAYS} ngày nếu chưa phiên âm). Bấm “Phiên âm” để bắt đầu.`
    : [
        uploadStatus === "discarded" && hasTranscript ? "Bản ghi chỉ giữ transcript." : null,
        canUpload
          ? storageReady
            ? `Tải tệp lên để lưu trên Google Drive, nghe lại theo từng câu${hasTranscript ? " và phiên âm lại" : " và phiên âm"}.`
            : `Chưa kết nối Google Drive: tệp tải lên chỉ được giữ tạm để phiên âm${hasTranscript ? " lại" : ""} rồi tự xoá (tối đa ${limit}).`
          : "Người tạo bản ghi có thể tải tệp ghi âm lên.",
      ]
        .filter(Boolean)
        .join(" ");
  const pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div className={cn("space-y-2 rounded-xl border bg-card px-3 py-2.5 shadow-sm", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {temporary ? (
            <HourglassIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          ) : (
            <CloudOffIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {canUpload ? (
          <div className="flex shrink-0 gap-2">
            {busy ? (
              <Button type="button" size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                Huỷ
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              <UploadCloudIcon /> {busy ? "Đang tải lên…" : storageReady ? "Tải tệp ghi âm lên" : hasTranscript ? "Tải lên để phiên âm lại" : "Tải lên để phiên âm"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f, storageReady ? "drive" : "temp");
              }}
            />
          </div>
        ) : null}
      </div>
      {progress ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="truncate">
              {file?.name} — {target === "drive" ? "đang tải lên Google Drive" : "đang gửi để phiên âm"}… {pct}%
            </span>
            <span>{progress.speedBps ? `${formatBytes(progress.speedBps)}/s` : ""}</span>
          </div>
          <Progress value={pct} />
        </div>
      ) : null}
      {driveError && file ? (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Không tải được lên Google Drive</p>
          <p className="break-words text-muted-foreground">{driveError}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => upload(file, "drive")} disabled={busy}>
              Thử lại
            </Button>
            <Button type="button" size="sm" onClick={() => upload(file, "temp")} disabled={busy || tooBigForTemp}>
              {hasTranscript ? "Phiên âm lại, không lưu tệp" : "Phiên âm, không lưu tệp"}
            </Button>
          </div>
          {tooBigForTemp ? <p className="text-xs text-muted-foreground">Tệp lớn hơn {limit} nên không phiên âm tạm được.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
