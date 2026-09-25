"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ClockIcon, PinIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { useProfile } from "@/components/profile-context";
import { usePlayer } from "@/components/player/player-context";
import { formatTimecode } from "@/lib/transcription/timecode";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  content: string;
  anchor_sec: number | null;
  pinned: boolean;
  updated_at: string;
}

/** Ghi chú cá nhân (chỉ mình bạn thấy), có thể gắn mốc thời gian trong bản ghi. */
export function NotesPanel({
  recordingId,
  draftRequest,
}: {
  recordingId: string;
  /** Yêu cầu tạo ghi chú từ nơi khác (mốc thời gian hoặc nội dung trả lời AI). */
  draftRequest?: { anchor?: number; content?: string; nonce: number } | null;
}) {
  const profile = useProfile();
  const player = usePlayer();
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    createClient()
      .from("notes")
      .select("id,content,anchor_sec,pinned,updated_at")
      .eq("recording_id", recordingId)
      .order("pinned", { ascending: false })
      .order("anchor_sec", { ascending: true, nullsFirst: false })
      .then(({ data }) => setNotes((data ?? []).map((n) => ({ ...n, anchor_sec: n.anchor_sec === null ? null : Number(n.anchor_sec) }))));
  }, [recordingId]);

  // Nhận yêu cầu tạo ghi chú từ transcript / câu trả lời AI (điều chỉnh state khi prop đổi)
  const [seenNonce, setSeenNonce] = useState<number | null>(null);
  if (draftRequest && draftRequest.nonce !== seenNonce) {
    setSeenNonce(draftRequest.nonce);
    if (draftRequest.anchor !== undefined) setAnchor(draftRequest.anchor);
    if (draftRequest.content) setText(draftRequest.content);
  }

  async function add() {
    if (!text.trim()) return;
    const { data, error } = await createClient()
      .from("notes")
      .insert({ user_id: profile.id, recording_id: recordingId, content: text.trim(), anchor_sec: anchor })
      .select("id,content,anchor_sec,pinned,updated_at")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Không lưu được ghi chú");
    setNotes((n) => [...n, { ...data, anchor_sec: data.anchor_sec === null ? null : Number(data.anchor_sec) }]);
    setText("");
    setAnchor(null);
  }

  async function update(id: string, patch: Partial<Pick<Note, "content" | "pinned">>) {
    const { error } = await createClient().from("notes").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function remove(id: string) {
    const { error } = await createClient().from("notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ghi chú riêng của bạn (hỗ trợ Markdown)…"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={anchor !== null ? "secondary" : "ghost"}
            onClick={() => setAnchor(anchor !== null ? null : Math.floor(player.currentTime))}
            title="Gắn ghi chú vào thời điểm đang phát"
          >
            <ClockIcon /> {anchor !== null ? `Mốc ${formatTimecode(anchor)}` : "Gắn mốc thời gian"}
          </Button>
          <Button size="sm" className="ml-auto" onClick={add} disabled={!text.trim()}>
            <PlusIcon /> Thêm ghi chú
          </Button>
        </div>
      </div>
      {notes.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Chưa có ghi chú. Ghi chú chỉ mình bạn thấy.</p> : null}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className={cn("group/note rounded-lg border bg-card p-3", n.pinned && "border-primary/40")}>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              {n.anchor_sec !== null ? (
                <button className="rounded bg-primary/10 px-1.5 font-mono text-primary" onClick={() => player.seek(n.anchor_sec!)}>
                  ▶ {formatTimecode(n.anchor_sec)}
                </button>
              ) : null}
              <span>{format(new Date(n.updated_at), "dd/MM/yyyy HH:mm")}</span>
              <div className="ml-auto flex gap-1 opacity-60 group-hover/note:opacity-100">
                <Button size="icon-sm" variant="ghost" onClick={() => update(n.id, { pinned: !n.pinned })} aria-label="Ghim">
                  <PinIcon className={n.pinned ? "fill-current text-primary" : ""} />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => remove(n.id)} aria-label="Xoá">
                  <Trash2Icon />
                </Button>
              </div>
            </div>
            {editingId === n.id ? (
              <div className="space-y-2">
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Huỷ
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      update(n.id, { content: editText });
                      setEditingId(null);
                    }}
                  >
                    Lưu
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="cursor-text"
                onDoubleClick={() => {
                  setEditingId(n.id);
                  setEditText(n.content);
                }}
              >
                <Markdown onCite={(_c, s) => player.seek(s)}>{n.content}</Markdown>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
