import { AlertCircleIcon, CheckCircle2Icon, CloudUploadIcon, Loader2Icon, PauseCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RecordingStatusBadge({ status, uploadStatus }: { status: string; uploadStatus?: string }) {
  if (uploadStatus && uploadStatus !== "uploaded") {
    return (
      <Badge variant="warning">
        <CloudUploadIcon /> {uploadStatus === "failed" ? "Tải lên lỗi" : "Chưa tải xong"}
      </Badge>
    );
  }
  switch (status) {
    case "ready":
      return (
        <Badge variant="success">
          <CheckCircle2Icon /> Sẵn sàng
        </Badge>
      );
    case "queued":
    case "processing":
      return (
        <Badge variant="secondary">
          <Loader2Icon className="animate-spin" /> Đang xử lý
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <AlertCircleIcon /> Lỗi
        </Badge>
      );
    default:
      return (
        <Badge variant="muted">
          <PauseCircleIcon /> Chưa phiên âm
        </Badge>
      );
  }
}
