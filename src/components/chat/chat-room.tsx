"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format, isSameDay } from "date-fns";
import { vi } from "date-fns/locale";
import { AudioLinesIcon, PaperclipIcon, PencilIcon, SendHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/components/profile-context";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  channel_id: string;
  sender_id: string | null;
  content: string;
  recording_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const PAGE = 50;

/** Phòng chat (nhóm hoặc 1-1): realtime, đánh dấu đã đọc, đính kèm bản ghi, sửa/xoá tin của mình. */
export function ChatRoom({ channelId, className }: { channelId: string; className?: string }) {
  const me = useProfile();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [recordings, setRecordings] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<{ id: string; title: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const enrich = useCallback(async (msgs: Msg[]) => {
    const supabase = createClient();
    const senderIds = [...new Set(msgs.map((m) => m.sender_id).filter((x): x is string => !!x))];
    const recIds = [...new Set(msgs.map((m) => m.recording_id).filter((x): x is string => !!x))];
    if (senderIds.length) {
      const { data } = await supabase.from("profiles").select("id,full_name,email,avatar_url").in("id", senderIds);
      setPeople((p) => ({ ...p, ...Object.fromEntries((data ?? []).map((x) => [x.id, x])) }));
    }
    if (recIds.length) {
      const { data } = await supabase.from("recordings").select("id,title").in("id", recIds);
      setRecordings((r) => ({ ...r, ...Object.fromEntries((data ?? []).map((x) => [x.id, x.title])) }));
    }
  }, []);

  const markRead = useCallback(async () => {
    await createClient().rpc("mark_channel_read", { p_channel: channelId });
    window.dispatchEvent(new Event("meetingai:chat-read"));
  }, [channelId]);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    supabase
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(PAGE)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []).reverse();
        setMessages(rows);
        setHasMore((data ?? []).length === PAGE);
        enrich(rows);
        markRead();
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      });
    const channel = supabase
      .channel(`room-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const m = payload.new as Msg;
        setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
        enrich([m]);
        markRead();
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const m = payload.new as Msg;
        setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [channelId, enrich, markRead]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const { data } = await createClient()
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const rows = (data ?? []).reverse();
    setMessages((cur) => [...rows, ...cur]);
    setHasMore((data ?? []).length === PAGE);
    enrich(rows);
  }

  async function send() {
    const content = text.trim();
    if (!content && !attach) return;
    const supabase = createClient();
    if (editing) {
      const { error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", editing);
      if (error) return toast.error(error.message);
      setEditing(null);
      setText("");
      return;
    }
    setText("");
    const recId = attach?.id ?? null;
    setAttach(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, sender_id: me.id, content, recording_id: recId })
      .select("*")
      .single();
    if (error) {
      setText(content);
      return toast.error(error.message);
    }
    if (data) {
      setMessages((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]));
      if (recId && attach) setRecordings((r) => ({ ...r, [recId]: attach.title }));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Thu hồi tin nhắn này?")) return;
    const { error } = await createClient().from("messages").update({ deleted_at: new Date().toISOString(), content: "" }).eq("id", id);
    if (error) toast.error(error.message);
  }

  const grouped = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const newDay = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
      const compact =
        !!prev && !newDay && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
      return { m, newDay, compact };
    });
  }, [messages]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {hasMore ? (
          <div className="pb-2 text-center">
            <Button size="sm" variant="ghost" onClick={loadOlder}>
              Tải tin nhắn cũ hơn
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</p> : null}
        {grouped.map(({ m, newDay, compact }) => {
          const mine = m.sender_id === me.id;
          const person = m.sender_id ? people[m.sender_id] : null;
          return (
            <div key={m.id}>
              {newDay ? (
                <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  {format(new Date(m.created_at), "EEEE, dd/MM/yyyy", { locale: vi })}
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div className={cn("group/m flex gap-2", mine && "flex-row-reverse", compact ? "mt-0.5" : "mt-3")}>
                <div className="w-8 shrink-0">{!compact && !mine ? <UserAvatar name={person?.full_name ?? person?.email} src={person?.avatar_url} /> : null}</div>
                <div className={cn("flex max-w-[80%] flex-col", mine && "items-end")}>
                  {!compact ? (
                    <div className="mb-0.5 text-xs text-muted-foreground">
                      {mine ? "Bạn" : (person?.full_name ?? person?.email ?? "…")} · {format(new Date(m.created_at), "HH:mm")}
                    </div>
                  ) : null}
                  {m.deleted_at ? (
                    <div className="rounded-2xl border border-dashed px-3 py-1.5 text-sm text-muted-foreground italic">Tin nhắn đã được thu hồi</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {mine ? (
                        <div className="hidden gap-0.5 group-hover/m:flex">
                          <button
                            className="rounded p-1 text-muted-foreground hover:bg-accent"
                            onClick={() => {
                              setEditing(m.id);
                              setText(m.content);
                            }}
                            aria-label="Sửa"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                          <button className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => remove(m.id)} aria-label="Thu hồi">
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "space-y-1.5 rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
                          mine ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        {m.content ? <div>{m.content}</div> : null}
                        {m.recording_id ? (
                          <Link
                            href={`/recordings/${m.recording_id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs",
                              mine ? "border-primary-foreground/30 bg-primary-foreground/10" : "bg-card",
                            )}
                          >
                            <AudioLinesIcon className="size-4 shrink-0" />
                            <span className="truncate font-medium">{recordings[m.recording_id] ?? "Bản ghi"}</span>
                          </Link>
                        ) : null}
                        {m.edited_at ? <div className="text-[10px] opacity-70">(đã sửa)</div> : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-2">
        {attach || editing ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-2 py-1 text-xs">
            {editing ? "Đang sửa tin nhắn" : <><AudioLinesIcon className="size-3.5" /> {attach?.title}</>}
            <button
              className="ml-auto"
              onClick={() => {
                setAttach(null);
                if (editing) {
                  setEditing(null);
                  setText("");
                }
              }}
              aria-label="Bỏ"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <Button type="button" size="icon" variant="ghost" onClick={() => setPickerOpen(true)} aria-label="Đính kèm bản ghi" disabled={!!editing}>
            <PaperclipIcon />
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Nhập tin nhắn…"
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" disabled={!text.trim() && !attach} aria-label="Gửi">
            <SendHorizontalIcon />
          </Button>
        </form>
      </div>
      <RecordingPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(r) => setAttach(r)} />
    </div>
  );
}

function RecordingPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (r: { id: string; title: string }) => void;
}) {
  const [items, setItems] = useState<{ id: string; title: string; meeting_date: string | null }[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    createClient()
      .from("recordings")
      .select("id,title,meeting_date")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setItems(data ?? []));
  }, [open]);
  const filtered = items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đính kèm bản ghi</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm bản ghi…" />
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onPick({ id: r.id, title: r.title });
                  onOpenChange(false);
                }}
              >
                <AudioLinesIcon className="size-4 text-primary" />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.meeting_date ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Người nhận chỉ mở được bản ghi nếu đã được chia sẻ quyền xem.</p>
      </DialogContent>
    </Dialog>
  );
}
