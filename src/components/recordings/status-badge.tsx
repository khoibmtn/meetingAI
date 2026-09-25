import { AlertCircleIcon, CheckCircle2Icon, CloudOffIcon, CloudUploadIcon, Loader2Icon, PauseCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Trạng thái tải lên mà bản ghi vẫn dùng được bình thường (không cần cảnh báo "chưa tải xong"). */
const USABLE_UPLOAD = ["uploaded", "temporary", "discarded"];

export function RecordingStatusBadge({
  status,
  uploadStatus,
  showStorage = false,
}: {
  status: string;
  uploadStatus?: string;
  /** Thêm nhãn "Không lưu tệp" khi bản ghi chỉ giữ transcript. */
  showStorage?: boolean;
}) {
  const badge = <StatusBadge status={status} uploadStatus={uploadStatus} />;
  if (uploadStatus === "discarded" && showStorage) {
    return (
      <>
        {badge}
        <Badge variant="muted" title="Tệp ghi âm không được lưu — chỉ giữ transcript">
          <CloudOffIcon /> Không lưu tệp
        </Badge>
      </>
    );
  }
  return badge;
}

function StatusBadge({ status, uploadStatus }: { status: string; uploadStatus?: string }) {
  if (uploadStatus && !USABLE_UPLOAD.includes(uploadStatus)) {
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
