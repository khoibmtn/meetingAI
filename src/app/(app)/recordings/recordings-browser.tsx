"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { AudioLinesIcon, CalendarIcon, ClockIcon, CloudOffIcon, MapPinIcon, SearchIcon, UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordingStatusBadge } from "@/components/recordings/status-badge";
import { CATEGORIES, categoryLabel } from "@/components/recordings/category";
import { formatDuration } from "@/lib/transcription/timecode";
import { cn, stripDiacritics } from "@/lib/utils";

export interface RecordingListItem {
  id: string;
  title: string;
  category: string;
  meetingDate: string | null;
  durationSec: number | null;
  status: string;
  uploadStatus: string;
  mine: boolean;
  ownerName: string | null;
  createdAt: string;
  tags: string[];
  location: string | null;
  groups: string[];
}

export function RecordingsBrowser({ items }: { items: RecordingListItem[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [owner, setOwner] = useState<"all" | "mine" | "shared">("all");
  const [hitState, setHitState] = useState<{ q: string; ids: Set<string> } | null>(null);
  const trimmed = query.trim();
  const contentHits = hitState && hitState.q === trimmed ? hitState.ids : null;

  // Tìm cả trong nội dung transcript (phía server, không phân biệt dấu)
  useEffect(() => {
    if (trimmed.length < 2) return;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("search_recordings", { p_query: trimmed, p_limit: 200 });
      setHitState({ q: trimmed, ids: new Set((data ?? []).map((r) => r.id)) });
    }, 300);
    return () => clearTimeout(t);
  }, [trimmed]);

  const filtered = useMemo(() => {
    const q = stripDiacritics(query.trim().toLowerCase());
    return items.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (owner === "mine" && !r.mine) return false;
      if (owner === "shared" && r.mine) return false;
      if (!q) return true;
      const hay = stripDiacritics(`${r.title} ${r.tags.join(" ")} ${r.location ?? ""} ${r.groups.join(" ")}`.toLowerCase());
      return hay.includes(q) || (contentHits?.has(r.id) ?? false);
    });
  }, [items, query, category, owner, contentHits]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<AudioLinesIcon />}
        title="Chưa có bản ghi nào"
        description="Tải lên tệp ghi âm giao ban/cuộc họp (m4a, mp3, wav…) hoặc ghi âm trực tiếp trên điện thoại."
        action={
          <Link href="/recordings/new" className="text-sm font-medium text-primary hover:underline">
            Tạo bản ghi đầu tiên →
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề, nội dung transcript, tên thuốc, người nói…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["all", "Tất cả"],
              ["mine", "Của tôi"],
              ["shared", "Được chia sẻ"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setOwner(v)}
              className={cn("rounded-md px-3 py-1", owner === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          Tất cả loại
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {trimmed.length >= 2 && !contentHits ? "Đang tìm trong nội dung transcript…" : "Không có bản ghi phù hợp."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recordings/${r.id}`}
                className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {categoryLabel(r.category)}
                  </Badge>
                  <RecordingStatusBadge status={r.status} uploadStatus={r.uploadStatus} />
                </div>
                <h3 className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">{r.title}</h3>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="size-3.5" />
                    {format(new Date(r.meetingDate ?? r.createdAt), "dd/MM/yyyy", { locale: vi })}
                  </span>
                  {r.durationSec ? (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3.5" />
                      {formatDuration(r.durationSec)}
                    </span>
                  ) : null}
                  {r.location ? (
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="size-3.5" />
                      {r.location}
                    </span>
                  ) : null}
                  {r.uploadStatus === "discarded" ? (
                    <span className="flex items-center gap-1" title="Tệp ghi âm không được lưu — chỉ giữ transcript">
                      <CloudOffIcon className="size-3.5" />
                      Không lưu tệp
                    </span>
                  ) : null}
                  {!r.mine && r.ownerName ? <span>• {r.ownerName}</span> : null}
                </div>
                {r.groups.length ? (
                  <div className="flex flex-wrap gap-1">
                    {r.groups.map((g) => (
                      <Badge key={g} variant="secondary" className="text-[11px]">
                        <UsersIcon /> {g}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
