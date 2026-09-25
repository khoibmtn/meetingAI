"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface PlayerState {
  src: string | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  ready: boolean;
  error: string | null;
  seek: (t: number, autoplay?: boolean) => void;
  toggle: () => void;
  setRate: (r: number) => void;
  skip: (delta: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const Ctx = createContext<PlayerState | null>(null);

export function PlayerProvider({ src, initialDuration, children }: { src: string | null; initialDuration?: number | null; children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setDuration] = useState(0);
  // Thời lượng từ siêu dữ liệu âm thanh; nếu trình duyệt chưa đọc được thì dùng số liệu máy chủ đã đo
  const duration = mediaDuration > 0 ? mediaDuration : (initialDuration ?? 0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [ready, setReady] = useState(false);
  const [errorState, setErrorState] = useState<{ src: string; message: string } | null>(null);
  const error = errorState && errorState.src === src ? errorState.message : null;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
      setReady(true);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      const code = a.error?.code;
      const report = (message: string) => setErrorState({ src: a.currentSrc || src || "", message });
      if (code === MediaError.MEDIA_ERR_NETWORK) return report("Mất kết nối khi tải âm thanh — thử tải lại trang.");
      if (code === MediaError.MEDIA_ERR_DECODE) return report("Tệp âm thanh bị lỗi giải mã.");
      // SRC_NOT_SUPPORTED: có thể do máy chủ trả lỗi (Drive chưa kết nối, hết quyền) hoặc trình duyệt không hỗ trợ codec.
      diagnoseAudioSource(a.currentSrc || src || "").then(report);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onErr);
    };
  }, [src]);

  const seek = useCallback((t: number, autoplay = true) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
    setCurrentTime(a.currentTime);
    if (autoplay) a.play().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const setRate = useCallback((r: number) => {
    const a = audioRef.current;
    if (a) a.playbackRate = r;
    setRateState(r);
  }, []);

  const skip = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime + delta);
  }, []);

  // Phím tắt: Space (phát/dừng, khi không gõ chữ), ←/→ (±5 s)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowLeft" && e.altKey) skip(-5);
      else if (e.code === "ArrowRight" && e.altKey) skip(5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip]);

  const value = useMemo(
    () => ({ src, currentTime, duration, playing, rate, ready, error, seek, toggle, setRate, skip, audioRef }),
    [src, currentTime, duration, playing, rate, ready, error, seek, toggle, setRate, skip],
  );
  return (
    <Ctx.Provider value={value}>
      {src ? <audio ref={audioRef} src={src} preload="metadata" className="hidden" /> : null}
      {children}
    </Ctx.Provider>
  );
}

/** Phân biệt lỗi máy chủ (Drive) với lỗi codec để thông báo đúng nguyên nhân. */
async function diagnoseAudioSource(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1" } });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).trim();
      return `Không tải được âm thanh: ${text.slice(0, 240) || `HTTP ${res.status}`}`;
    }
    const type = res.headers.get("content-type") ?? "";
    await res.body?.cancel().catch(() => {});
    return `Trình duyệt này không phát được định dạng ${type || "âm thanh"} — hãy dùng Chrome, Edge hoặc Safari bản mới.`;
  } catch {
    return "Không tải được âm thanh — kiểm tra kết nối mạng.";
  }
}

export function usePlayer(): PlayerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer phải nằm trong PlayerProvider");
  return v;
}
