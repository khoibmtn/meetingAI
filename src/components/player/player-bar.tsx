"use client";

import { useMemo, useRef } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatTimecode } from "@/lib/transcription/timecode";
import { speakerColorIndex } from "@/lib/transcription/speakers";
import type { Segment, Speaker } from "@/lib/transcription/types";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-context";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function PlayerBar({ segments, speakers, className }: { segments: Segment[]; speakers: Speaker[]; className?: string }) {
  const p = usePlayer();
  const barRef = useRef<HTMLDivElement>(null);
  const duration = p.duration || segments[segments.length - 1]?.end || 0;
  const pct = duration ? Math.min(100, (p.currentTime / duration) * 100) : 0;

  // Dải màu người nói trên thanh thời gian
  const blocks = useMemo(() => {
    if (!duration) return [];
    return segments.map((s) => ({
      left: (s.start / duration) * 100,
      width: Math.max(0.15, ((s.end - s.start) / duration) * 100),
      color: `var(--spk-${speakerColorIndex(s.speaker, speakers)})`,
    }));
  }, [segments, speakers, duration]);

  function seekFromEvent(clientX: number) {
    const el = barRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    p.seek(((clientX - r.left) / r.width) * duration, false);
  }

  if (!p.src) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm", className)}>
      <Button size="icon-sm" variant="ghost" onClick={() => p.skip(-10)} aria-label="Lùi 10 giây">
        <RotateCcwIcon />
      </Button>
      <Button size="icon" className="rounded-full" onClick={p.toggle} aria-label={p.playing ? "Tạm dừng" : "Phát"}>
        {p.playing ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={() => p.skip(10)} aria-label="Tới 10 giây">
        <RotateCwIcon />
      </Button>
      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatTimecode(p.currentTime)}</span>
      <div
        ref={barRef}
        className="relative h-8 flex-1 cursor-pointer touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromEvent(e.clientX);
        }}
        role="slider"
        aria-label="Vị trí phát"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(p.currentTime)}
      >
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          {blocks.map((b, i) => (
            <div key={i} className="absolute top-0 h-full opacity-60" style={{ left: `${b.left}%`, width: `${b.width}%`, background: b.color }} />
          ))}
        </div>
        <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-foreground/25" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="hidden w-12 font-mono text-xs tabular-nums text-muted-foreground sm:inline">{formatTimecode(duration)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="w-12 font-mono text-xs">
            {p.rate}×
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {RATES.map((r) => (
            <DropdownMenuItem key={r} onSelect={() => p.setRate(r)}>
              {r}× {r === p.rate ? "✓" : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
