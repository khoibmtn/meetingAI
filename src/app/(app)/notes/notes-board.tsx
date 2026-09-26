"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import { AudioLinesIcon, PinIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { formatTimecode } from "@/lib/transcription/timecode";
import { cn, stripDiacritics } from "@/lib/utils";

interface NoteItem {
  id: string;
  title: string | null;
  content: string;
  anchorSec: number | null;
  pinned: boolean;
  updatedAt: string;
  recordingId: string | null;
  recordingTitle: string | null;
}

export function NotesBoard({ initial }: { initial: NoteItem[] }) {
  const me = useProfile();
  const [notes, setNotes] = useState(initial);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");

  const filtered = useMemo(() => {
    const s = stripDiacritics(q.trim().toLowerCase());
    if (!s) return notes;
    return notes.filter((n) => stripDiacritics(`${n.title ?? ""} ${n.content} ${n.recordingTitle ?? ""}`.toLowerCase()).includes(s));
  }, [notes, q]);

  async function add() {
    if (!draft.trim()) return;
    const { data, error } = await createClient()
      .from("notes")
      .insert({ user_id: me.id, content: draft.trim() })
      .select("id, title, content, anchor_sec, pinned, updated_at, recording_id")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Không lưu được");
    setNotes((n) => [
      { id: data.id, title: data.title, content: data.content, anchorSec: null, pinned: false, updatedAt: data.updated_at, recordingId: null, recordingTitle: null },
      ...n,
    ]);
    setDraft("");
  }

  async function togglePin(n: NoteItem) {
    const { error } = await createClient().from("notes").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) return toast.error(error.message);
    setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
  }

  async function remove(n: NoteItem) {
    if (!window.confirm("Xoá ghi chú?")) return;
    const { error } = await createClient().from("notes").delete().eq("id", n.id);
    if (error) return toast.error(error.message);
    setNotes((cur) => cur.filter((x) => x.id !== n.id));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong ghi chú…" className="pl-9" />
        </div>
      </div>
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Ghi chú nhanh (không gắn bản ghi)…" />
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={!draft.trim()}>
            <PlusIcon /> Thêm
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Không có ghi chú.</p> : null}
      <ul className="columns-1 gap-3 md:columns-2 xl:columns-3 [&>li]:mb-3 [&>li]:break-inside-avoid">
        {filtered.map((n) => (
          <li key={n.id} className={cn("rounded-xl border bg-card p-3", n.pinned && "border-primary/40")}>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              {n.recordingId ? (
                <Link
                  href={`/recordings/${n.recordingId}?tab=notes${n.anchorSec !== null ? `&t=${Math.floor(n.anchorSec)}` : ""}`}
                  className="flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <AudioLinesIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{n.recordingTitle}</span>
                  {n.anchorSec !== null ? <span className="font-mono">@{formatTimecode(n.anchorSec)}</span> : null}
                </Link>
              ) : (
                <span>Ghi chú nhanh</span>
              )}
              <span className="ml-auto shrink-0">{format(new Date(n.updatedAt), "dd/MM/yyyy")}</span>
              <button onClick={() => togglePin(n)} aria-label="Ghim" className="rounded p-0.5 hover:bg-accent">
                <PinIcon className={cn("size-3.5", n.pinned && "fill-current text-primary")} />
              </button>
              <button onClick={() => remove(n)} aria-label="Xoá" className="rounded p-0.5 hover:bg-accent">
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
            {n.title ? <div className="mb-1 font-medium">{n.title}</div> : null}
            <Markdown className="text-sm">{n.content}</Markdown>
          </li>
        ))}
      </ul>
    </div>
  );
}
