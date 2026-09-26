"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MicIcon, PauseIcon, PlayIcon, SquareIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/lib/transcription/timecode";
import { clearSession, listSessions, loadSession, saveChunk } from "@/lib/client/recorder-store";
import { formatBytes } from "@/lib/utils";

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  for (const c of candidates) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export interface RecordedAudio {
  blob: Blob;
  durationSec: number;
  session: string;
}

/**
 * Ghi âm trực tiếp trên trình duyệt (điện thoại/laptop). Tắt khử tiếng vọng/khử nhiễu của trình
 * duyệt để giữ nguyên âm thanh gốc; giữ màn hình sáng; lưu tạm từng 5 giây vào IndexedDB.
 */
export function Recorder({ onComplete }: { onComplete: (r: RecordedAudio) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [recoverable, setRecoverable] = useState<{ session: string; size: number; at: number } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const accRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    listSessions()
      .then((s) => setRecoverable(s[0] ?? null))
      .catch(() => {});
    return () => stopAll();
  }, []);

  function stopAll() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000 });
      sessionRef.current = `rec-${Date.now()}`;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          saveChunk(sessionRef.current, e.data, rec.mimeType).catch(() => {});
        }
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        stopAll();
        setState("idle");
        onComplete({ blob, durationSec: accRef.current, session: sessionRef.current });
      };
      rec.start(5000);
      mediaRef.current = rec;
      startRef.current = Date.now();
      accRef.current = 0;
      setElapsed(0);
      setState("recording");
      timerRef.current = window.setInterval(() => {
        setElapsed(accRef.current + (Date.now() - startRef.current) / 1000);
      }, 250);
      meter(stream);
      try {
        wakeRef.current = await navigator.wakeLock?.request("screen");
      } catch {
        /* không hỗ trợ */
      }
    } catch (e) {
      toast.error(`Không truy cập được micro: ${(e as Error).message}`);
    }
  }

  function meter(stream: MediaStream) {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function pause() {
    mediaRef.current?.pause();
    accRef.current += (Date.now() - startRef.current) / 1000;
    setState("paused");
  }

  function resume() {
    mediaRef.current?.resume();
    startRef.current = Date.now();
    setState("recording");
  }

  function stop() {
    if (state === "recording") accRef.current += (Date.now() - startRef.current) / 1000;
    mediaRef.current?.stop();
  }

  async function recover() {
    if (!recoverable) return;
    const blob = await loadSession(recoverable.session);
    if (!blob) return;
    const d = await import("@/lib/client/upload").then((m) => m.readAudioDuration(blob));
    onComplete({ blob, durationSec: d ?? 0, session: recoverable.session });
  }

  async function discard() {
    if (recoverable) await clearSession(recoverable.session);
    setRecoverable(null);
  }

  return (
    <div className="space-y-4">
      {recoverable && state === "idle" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
          <div className="flex-1">
            Có một bản ghi âm chưa lưu ({formatBytes(recoverable.size)}, {new Date(recoverable.at).toLocaleString("vi-VN")}).
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={recover}>
              <RotateCcwIcon /> Khôi phục
            </Button>
            <Button size="sm" variant="ghost" onClick={discard}>
              Bỏ
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-8">
        <div className="font-mono text-5xl tabular-nums tracking-tight">{formatTimecode(elapsed, { forceHours: elapsed >= 3600 })}</div>
        <div className="flex h-10 w-full max-w-xs items-end justify-center gap-1">
          {Array.from({ length: 24 }).map((_, i) => {
            const h = state === "recording" ? Math.max(0.08, level * (0.6 + 0.4 * Math.sin((i + elapsed * 8) / 2) ** 2)) : 0.08;
            return <div key={i} className="w-1.5 rounded-full bg-primary/70" style={{ height: `${h * 100}%` }} />;
          })}
        </div>
        <div className="flex items-center gap-3">
          {state === "idle" ? (
            <Button size="lg" className="h-14 rounded-full px-8 text-base" onClick={start}>
              <MicIcon /> Bắt đầu ghi âm
            </Button>
          ) : (
            <>
              {state === "recording" ? (
                <Button size="lg" variant="outline" className="h-12 rounded-full" onClick={pause}>
                  <PauseIcon /> Tạm dừng
                </Button>
              ) : (
                <Button size="lg" variant="outline" className="h-12 rounded-full" onClick={resume}>
                  <PlayIcon /> Tiếp tục
                </Button>
              )}
              <Button size="lg" variant="destructive" className="h-12 rounded-full" onClick={stop}>
                <SquareIcon /> Dừng & lưu
              </Button>
            </>
          )}
        </div>
        <p className="max-w-md text-center text-xs text-muted-foreground">
          Đặt thiết bị gần khu vực người phát biểu. Giữ màn hình mở trong khi ghi. Âm thanh được lưu tạm liên tục để không bị mất nếu
          trình duyệt đóng đột ngột.
        </p>
      </div>
    </div>
  );
}
