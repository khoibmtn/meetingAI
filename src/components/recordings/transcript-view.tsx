"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CrosshairIcon,
  InfoIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayer } from "@/components/player/player-context";
import { formatTimecode } from "@/lib/transcription/timecode";
import { speakerColorIndex } from "@/lib/transcription/speakers";
import { speakerDisplay, toTurns, type Turn } from "@/lib/transcription/format";
import type { Segment, Speaker } from "@/lib/transcription/types";
import { cn, stripDiacritics } from "@/lib/utils";
import { SpeakerDialog } from "./speaker-dialog";

interface Props {
  segments: Segment[];
  speakers: Speaker[];
  canEdit: boolean;
  saving?: boolean;
  onUpdateSegment: (id: string, patch: Partial<Pick<Segment, "text" | "speaker">>) => void;
  onDeleteSegment: (id: string) => void;
  onRenameSpeaker: (key: string, name: string, role: string | null) => void;
  onMergeSpeakers: (from: string, into: string) => void;
  onAddSpeaker: (name: string) => string | null;
  onAddNoteAt?: (seconds: number) => void;
}

function findActive(segments: Segment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= t + 0.05) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function TranscriptView(props: Props) {
  const { segments, speakers, canEdit } = props;
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [follow, setFollow] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [speakerDialog, setSpeakerDialog] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrollAt = useRef(0);

  const turns = useMemo(() => toTurns(segments, 4, 180), [segments]);
  const activeIdx = findActive(segments, player.currentTime);
  const activeId = activeIdx >= 0 && segments[activeIdx].end + 1.5 >= player.currentTime ? segments[activeIdx].id : null;

  const normQuery = stripDiacritics(query.trim().toLowerCase());
  const matches = useMemo(
    () => (normQuery.length >= 2 ? segments.filter((s) => stripDiacritics(s.text.toLowerCase()).includes(normQuery)).map((s) => s.id) : []),
    [segments, normQuery],
  );
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Tự cuộn theo vị trí đang phát (tạm dừng 5 giây nếu người dùng tự cuộn)
  useEffect(() => {
    if (!follow || !activeId || !player.playing) return;
    if (Date.now() - userScrollAt.current < 5000) return;
    const el = containerRef.current?.querySelector(`[data-seg="${activeId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId, follow, player.playing]);

  useEffect(() => {
    if (!matches.length) return;
    const id = matches[Math.min(matchIdx, matches.length - 1)];
    containerRef.current?.querySelector(`[data-seg="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [matchIdx, matches]);

  const talk = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of segments) m[s.speaker] = (m[s.speaker] ?? 0) + (s.end - s.start);
    return m;
  }, [segments]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Người nói */}
      <div className="flex flex-wrap gap-1.5">
        {speakers.map((s) => (
          <button
            key={s.key}
            onClick={() => canEdit && setSpeakerDialog(s.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2.5 pl-1 text-xs",
              canEdit && "hover:border-primary/50",
            )}
            title={canEdit ? "Đổi tên / gộp người nói" : undefined}
          >
            <span
              className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: `var(--spk-${speakerColorIndex(s.key, speakers)})` }}
            >
              {(s.name || s.key).replace(/^(Thầy|Cô|BS\.?|Bác sĩ)\s+/i, "").charAt(0).toUpperCase()}
            </span>
            <span className="font-medium">{speakerDisplay(s.key, speakers)}</span>
            <span className="text-muted-foreground">{Math.round((talk[s.key] ?? 0) / 60)}′</span>
          </button>
        ))}
      </div>

      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMatchIdx(0);
            }}
            placeholder="Tìm trong transcript (không cần dấu)…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {normQuery.length >= 2 ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {matches.length ? `${Math.min(matchIdx + 1, matches.length)}/${matches.length}` : "0 kết quả"}
            <Button size="icon-sm" variant="ghost" disabled={!matches.length} onClick={() => setMatchIdx((i) => (i - 1 + matches.length) % matches.length)}>
              <ChevronUpIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={!matches.length} onClick={() => setMatchIdx((i) => (i + 1) % matches.length)}>
              <ChevronDownIcon />
            </Button>
          </div>
        ) : null}
        <Button size="sm" variant={follow ? "secondary" : "ghost"} onClick={() => setFollow((f) => !f)} title="Tự cuộn theo âm thanh">
          <CrosshairIcon /> Theo dõi
        </Button>
        {canEdit ? (
          <Button size="sm" variant={editMode ? "default" : "ghost"} onClick={() => setEditMode((v) => !v)}>
            <PencilIcon /> {editMode ? "Đang hiệu đính" : "Hiệu đính"}
          </Button>
        ) : null}
        {props.saving ? <span className="text-xs text-muted-foreground">Đang lưu…</span> : null}
      </div>

      {/* Nội dung */}
      <div
        ref={containerRef}
        onWheel={() => (userScrollAt.current = Date.now())}
        onTouchMove={() => (userScrollAt.current = Date.now())}
        className="space-y-4"
      >
        {turns.map((turn) => (
          <TurnBlock
            key={turn.segmentIds[0]}
            {...props}
            turn={turn}
            activeId={activeId}
            matchSet={matchSet}
            editMode={editMode}
            query={query}
            onSeek={(t) => player.seek(t)}
            onSpeakerClick={() => canEdit && setSpeakerDialog(turn.speaker)}
          />
        ))}
      </div>

      {speakerDialog ? (
        <SpeakerDialog
          open
          onOpenChange={(o) => !o && setSpeakerDialog(null)}
          speaker={speakers.find((s) => s.key === speakerDialog)!}
          speakers={speakers}
          onRename={props.onRenameSpeaker}
          onMerge={props.onMergeSpeakers}
        />
      ) : null}
    </div>
  );
}

const TurnBlock = memo(function TurnBlock({
  turn,
  segments,
  speakers,
  activeId,
  matchSet,
  editMode,
  query,
  onSeek,
  onSpeakerClick,
  onUpdateSegment,
  onDeleteSegment,
  onAddSpeaker,
  onAddNoteAt,
}: Props & {
  turn: Turn;
  activeId: string | null;
  matchSet: Set<string>;
  editMode: boolean;
  query: string;
  onSeek: (t: number) => void;
  onSpeakerClick: () => void;
}) {
  const color = `var(--spk-${speakerColorIndex(turn.speaker, speakers)})`;
  const segs = turn.segmentIds.map((id) => segments.find((s) => s.id === id)!).filter(Boolean);
  return (
    <div className="group/turn grid grid-cols-[3.25rem_1fr] gap-x-3 [content-visibility:auto] [contain-intrinsic-size:auto_120px]">
      <button onClick={() => onSeek(turn.start)} className="pt-0.5 text-left font-mono text-xs text-muted-foreground tabular-nums hover:text-primary">
        {formatTimecode(turn.start)}
      </button>
      <div className="min-w-0 border-l-2 pl-3" style={{ borderColor: color }}>
        <button onClick={onSpeakerClick} className="mb-0.5 text-sm font-semibold" style={{ color }}>
          {speakerDisplay(turn.speaker, speakers)}
        </button>
        <div className="leading-7">
          {segs.map((s) =>
            editMode ? (
              <EditableSegment
                key={s.id}
                seg={s}
                speakers={speakers}
                onSave={(text) => onUpdateSegment(s.id, { text })}
                onSpeaker={(speaker) => onUpdateSegment(s.id, { speaker })}
                onDelete={() => onDeleteSegment(s.id)}
                onAddSpeaker={onAddSpeaker}
                onSeek={() => onSeek(s.start)}
                onNote={onAddNoteAt ? () => onAddNoteAt(s.start) : undefined}
              />
            ) : (
              <span
                key={s.id}
                data-seg={s.id}
                onClick={() => onSeek(s.start)}
                className={cn(
                  "cursor-pointer rounded px-0.5 transition-colors hover:bg-accent",
                  activeId === s.id && "bg-primary/15",
                  matchSet.has(s.id) && "bg-warning/40",
                  s.flags?.includes("uncertain") && "underline decoration-warning decoration-dotted underline-offset-4",
                )}
              >
                <Highlight text={s.text} query={query} />
                {s.flags?.includes("gap_fill") ? (
                  <FlagIcon label="Câu được bổ sung ở lượt quét khoảng bị bỏ sót" icon={<SparklesIcon className="size-3" />} />
                ) : null}
                {s.flags?.includes("term_corrected") ? (
                  <FlagIcon label="AI đã hiệu đính thuật ngữ trong câu này" icon={<InfoIcon className="size-3" />} />
                ) : null}{" "}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
});

function FlagIcon({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-0.5 inline-flex translate-y-0.5 text-primary">{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Tô sáng chuỗi tìm kiếm (khớp chính xác không phân biệt hoa/thường; nếu khác dấu thì cả câu đã được tô). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-warning px-0.5 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function EditableSegment({
  seg,
  speakers,
  onSave,
  onSpeaker,
  onDelete,
  onAddSpeaker,
  onSeek,
  onNote,
}: {
  seg: Segment;
  speakers: Speaker[];
  onSave: (text: string) => void;
  onSpeaker: (key: string) => void;
  onDelete: () => void;
  onAddSpeaker: (name: string) => string | null;
  onSeek: () => void;
  onNote?: () => void;
}) {
  const [text, setText] = useState(seg.text);
  const dirty = text.trim() !== seg.text;
  return (
    <div data-seg={seg.id} className="mb-2 rounded-lg border bg-card p-2">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={onSeek} className="font-mono hover:text-primary">
          {formatTimecode(seg.start)}–{formatTimecode(seg.end)}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
              <UserRoundIcon /> Đổi người nói
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Gán câu này cho</DropdownMenuLabel>
            {speakers.map((s) => (
              <DropdownMenuItem key={s.key} onSelect={() => onSpeaker(s.key)}>
                {speakerDisplay(s.key, speakers)} {s.key === seg.speaker ? "✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                const name = window.prompt("Tên người nói mới");
                if (name) {
                  const key = onAddSpeaker(name);
                  if (key) onSpeaker(key);
                }
              }}
            >
              + Người nói mới…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onNote ? (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onNote}>
            + Ghi chú
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-xs text-destructive"
          onClick={() => window.confirm("Xoá câu này khỏi transcript? (bản máy gốc vẫn được giữ)") && onDelete()}
        >
          <Trash2Icon />
        </Button>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(8, Math.max(2, Math.ceil(text.length / 90)))} className="text-sm" />
      {dirty ? (
        <div className="mt-1 flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setText(seg.text)}>
            Huỷ
          </Button>
          <Button size="sm" onClick={() => onSave(text.trim())}>
            Lưu
          </Button>
        </div>
      ) : null}
    </div>
  );
}
