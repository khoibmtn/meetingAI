"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { vi } from "date-fns/locale";
import { PenSquareIcon, UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/components/profile-context";
import { cn } from "@/lib/utils";

export interface ChannelInfo {
  channel_id: string;
  kind: string;
  group_id: string | null;
  title: string;
  avatar_url: string | null;
  other_user_id: string | null;
  last_message_at: string | null;
  last_message: string | null;
  unread_count: number;
}

export function useChannels() {
  const me = useProfile();
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await createClient().rpc("my_channels");
    setChannels((data ?? []).map((c) => ({ ...c, unread_count: Number(c.unread_count ?? 0) })) as ChannelInfo[]);
  }, []);
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    supabase.rpc("my_channels").then(({ data }) => {
      if (alive) setChannels((data ?? []).map((c) => ({ ...c, unread_count: Number(c.unread_count ?? 0) })) as ChannelInfo[]);
    });
    const ch = supabase
      .channel(`channels-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    const onRead = () => load();
    window.addEventListener("meetingai:chat-read", onRead);
    return () => {
      alive = false;
      window.removeEventListener("meetingai:chat-read", onRead);
      supabase.removeChannel(ch);
    };
  }, [me.id, load]);
  return { channels, reload: load };
}

export function ChannelList({ activeId, className }: { activeId?: string; className?: string }) {
  const { channels } = useChannels();
  const [dmOpen, setDmOpen] = useState(false);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="font-semibold">Trò chuyện</div>
        <Button size="sm" variant="outline" onClick={() => setDmOpen(true)}>
          <PenSquareIcon /> Tin nhắn mới
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {channels === null ? <li className="p-3 text-sm text-muted-foreground">Đang tải…</li> : null}
        {channels?.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Chưa có cuộc trò chuyện. Tham gia nhóm hoặc nhắn tin cho đồng nghiệp.</li>
        ) : null}
        {channels?.map((c) => (
          <li key={c.channel_id}>
            <Link
              href={`/chat/${c.channel_id}`}
              className={cn("flex items-center gap-3 rounded-lg p-2 hover:bg-accent", activeId === c.channel_id && "bg-accent")}
            >
              {c.kind === "group" ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UsersIcon className="size-4" />
                </div>
              ) : (
                <UserAvatar name={c.title} src={c.avatar_url} className="size-9" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn("truncate text-sm", c.unread_count ? "font-semibold" : "font-medium")}>{c.title}</span>
                  {c.last_message_at ? (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(c.last_message_at), { locale: vi })}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs text-muted-foreground">{c.last_message || (c.kind === "group" ? "Kênh chat nhóm" : "Bắt đầu trò chuyện")}</span>
                  {c.unread_count ? (
                    <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{c.unread_count}</span>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <NewDmDialog open={dmOpen} onOpenChange={setDmOpen} />
    </div>
  );
}

function NewDmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useProfile();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null; department: string | null }[]>([]);
  const query = q.trim();
  useEffect(() => {
    const t = setTimeout(async () => {
      const safe = query.replace(/[%,()]/g, "");
      let req = createClient().from("profiles").select("id,full_name,email,avatar_url,department").eq("status", "active").neq("id", me.id).limit(20);
      if (safe) req = req.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,department.ilike.%${safe}%`);
      const { data } = await req.order("full_name");
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [query, me.id]);

  async function start(userId: string) {
    const { data, error } = await createClient().rpc("get_or_create_dm", { p_other: userId });
    if (error || !data) return toast.error(error?.message ?? "Không mở được cuộc trò chuyện");
    onOpenChange(false);
    router.push(`/chat/${data}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tin nhắn mới</DialogTitle>
          <DialogDescription>Chọn đồng nghiệp để nhắn tin riêng.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, email, khoa/phòng…" autoFocus />
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {results.map((u) => (
            <li key={u.id}>
              <button onClick={() => start(u.id)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent">
                <UserAvatar name={u.full_name ?? u.email} src={u.avatar_url} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{u.full_name ?? u.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{[u.department, u.email].filter(Boolean).join(" • ")}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
