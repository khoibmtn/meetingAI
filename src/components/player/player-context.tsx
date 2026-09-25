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
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const onErr = () => setError("Không phát được âm thanh (kiểm tra kết nối Google Drive)");
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

export function usePlayer(): PlayerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer phải nằm trong PlayerProvider");
  return v;
}
