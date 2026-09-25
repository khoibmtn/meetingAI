"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiJson } from "@/lib/client/api";

type Job = Tables<"transcription_jobs">;

const ACTIVE = ["queued", "preparing", "transcribing", "finalizing"];
/** Nếu tiến độ đứng yên quá lâu → tự yêu cầu server khôi phục (worker có thể đã hết giờ). */
const WATCHDOG_MS = 90_000;

export function JobProgress({ initialJob, canEdit }: { initialJob: Job; canEdit: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<Job>(initialJob);
  const [retrying, setRetrying] = useState(false);
  const lastKick = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job-${initialJob.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "transcription_jobs", filter: `id=eq.${initialJob.id}` },
        (payload) => setJob(payload.new as Job),
      )
      .subscribe();
    // Dự phòng khi realtime chưa bật: hỏi lại mỗi 5 giây
    const poll = window.setInterval(async () => {
      const { data } = await supabase.from("transcription_jobs").select("*").eq("id", initialJob.id).maybeSingle();
      if (data) setJob(data);
    }, 5000);
    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [initialJob.id]);

  // Xong → tải lại dữ liệu trang
  useEffect(() => {
    if (job.status === "done") {
      toast.success("Phiên âm hoàn tất");
      router.refresh();
    }
  }, [job.status, router]);

  // Watchdog phía client
  useEffect(() => {
    if (!ACTIVE.includes(job.status)) return;
    const t = window.setInterval(() => {
      const idle = Date.now() - new Date(job.updated_at).getTime();
      if (idle > WATCHDOG_MS && Date.now() - lastKick.current > WATCHDOG_MS) {
        lastKick.current = Date.now();
        apiJson(`/api/jobs/${job.id}/resume`, { method: "POST", json: {} }).catch(() => {});
      }
    }, 15_000);
    return () => window.clearInterval(t);
  }, [job.status, job.updated_at, job.id]);

  async function retry() {
    setRetrying(true);
    try {
      await apiJson(`/api/jobs/${job.id}/resume`, { method: "POST", json: { retryFailed: true } });
      toast.success("Đang thử lại");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  if (job.status === "error") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Phiên âm gặp lỗi</div>
          <div className="text-sm break-words text-muted-foreground">{job.error}</div>
        </div>
        {canEdit ? (
          <Button variant="outline" onClick={retry} disabled={retrying}>
            <RefreshCwIcon className={retrying ? "animate-spin" : ""} /> Thử lại
          </Button>
        ) : null}
      </div>
    );
  }
  if (!ACTIVE.includes(job.status)) return null;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin text-primary" />
        <span className="font-medium">{job.stage ?? "Đang xử lý…"}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{Math.round(Number(job.progress))}%</span>
      </div>
      <Progress value={Number(job.progress)} />
      <p className="text-xs text-muted-foreground">
        {job.engine === "soniox" ? "Soniox" : "Gemini"} • {job.model}
        {job.total_chunks > 1 ? ` • ${job.done_chunks}/${job.total_chunks} đoạn` : ""} — có thể rời trang, quá trình vẫn tiếp tục.
      </p>
    </div>
  );
}
