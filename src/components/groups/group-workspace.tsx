"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  AudioLinesIcon,
  CheckIcon,
  CopyIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { ChatRoom } from "@/components/chat/chat-room";
import { RecordingStatusBadge } from "@/components/recordings/status-badge";
import { categoryLabel } from "@/components/recordings/category";
import { useProfile } from "@/components/profile-context";
import { formatDuration } from "@/lib/transcription/timecode";
import { cn } from "@/lib/utils";
import { useOrigin } from "@/lib/hooks/use-media-query";

interface GroupRecording {
  shareId: string;
  permission: string;
  sharedAt: string;
  sharedBy: string | null;
  id: string;
  title: string;
  category: string;
  meeting_date: string | null;
  duration_sec: number | null;
  status: string;
  owner_id: string;
  hasTranscript: boolean;
}

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  name: string;
  email: string | null;
  avatar: string | null;
  department: string | null;
}

/** Trên điện thoại ẩn biểu tượng để 5 tab vừa một hàng. */
const MOBILE_TAB = "max-sm:px-1.5 max-sm:[&>svg]:hidden";

export function GroupWorkspace({
  group,
  myRole,
  channelId,
  members,
  recordings,
}: {
  group: { id: string; name: string; description: string | null; inviteCode: string; inviteEnabled: boolean; ownerId: string };
  myRole: string;
  channelId: string | null;
  members: Member[];
  recordings: GroupRecording[];
}) {
  const router = useRouter();
  const me = useProfile();
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [tab, setTab] = useState("recordings");
  const withTranscript = recordings.filter((r) => r.hasTranscript);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sourceIds = useMemo(() => [...selected], [selected]);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:py-6">
      <div className="space-y-1">
        <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Nhóm
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{group.name}</h1>
          <Badge variant="secondary">{members.length} thành viên</Badge>
        </div>
        {group.description ? <p className="text-sm text-muted-foreground">{group.description}</p> : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="recordings" className={MOBILE_TAB}>
            <AudioLinesIcon /> Bản ghi
          </TabsTrigger>
          <TabsTrigger value="ai" className={MOBILE_TAB}>
            <MessageSquareTextIcon /> Hỏi đáp<span className="max-sm:hidden"> AI</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className={MOBILE_TAB}>
            <MessagesSquareIcon /> Trò chuyện
          </TabsTrigger>
          <TabsTrigger value="members" className={MOBILE_TAB}>
            <UsersIcon /> Thành viên
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="settings" aria-label="Cài đặt nhóm" className="flex-none max-sm:px-1.5">
              <SettingsIcon />
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="recordings" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button onClick={() => setShareOpen(true)}>
              <PlusIcon /> Chia sẻ bản ghi của tôi
            </Button>
          </div>
          {recordings.length === 0 ? (
            <EmptyState icon={<AudioLinesIcon />} title="Chưa có bản ghi nào trong nhóm" description="Chia sẻ bản ghi để cả nhóm cùng nghe, đọc transcript, văn bản tổng hợp và hỏi đáp AI." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {recordings.map((r) => (
                <li key={r.shareId} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline">{categoryLabel(r.category)}</Badge>
                    <RecordingStatusBadge status={r.status} />
                  </div>
                  <Link href={`/recordings/${r.id}`} className="font-semibold hover:text-primary">
                    {r.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {r.meeting_date ? format(new Date(r.meeting_date), "dd/MM/yyyy") : ""} {r.duration_sec ? `• ${formatDuration(r.duration_sec)}` : ""} •{" "}
                    {r.permission === "edit" ? "Được sửa" : "Chỉ xem"}
                  </div>
                  {r.owner_id === me.id || isAdmin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start text-destructive"
                      onClick={async () => {
                        if (!window.confirm("Gỡ bản ghi khỏi nhóm?")) return;
                        const { error } = await createClient().from("recording_shares").delete().eq("id", r.shareId);
                        if (error) return toast.error(error.message);
                        router.refresh();
                      }}
                    >
                      <Trash2Icon /> Gỡ khỏi nhóm
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <ShareMyRecordingsDialog open={shareOpen} onOpenChange={setShareOpen} groupId={group.id} channelId={channelId} alreadyShared={recordings.map((r) => r.id)} />
        </TabsContent>

        <TabsContent value="ai" className="pt-3">
          {withTranscript.length === 0 ? (
            <EmptyState icon={<MessageSquareTextIcon />} title="Chưa có nguồn để hỏi đáp" description="Cần ít nhất một bản ghi đã phiên âm được chia sẻ vào nhóm." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Nguồn ({selected.size || withTranscript.length})</div>
                  <button className="text-xs text-primary hover:underline" onClick={() => setSelected(new Set())}>
                    Tất cả
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Không chọn = dùng tất cả bản ghi của nhóm.</p>
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                  {withTranscript.map((r) => {
                    const on = selected.has(r.id);
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              return n;
                            })
                          }
                          className={cn("flex w-full items-start gap-2 rounded-md p-1.5 text-left text-sm hover:bg-accent", on && "bg-accent")}
                        >
                          <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>
                            {on ? <CheckIcon className="size-3" /> : null}
                          </span>
                          <span className="line-clamp-2">{r.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <AiChatPanel
                key={sourceIds.join(",")}
                groupId={group.id}
                sourceIds={sourceIds}
                suggestions={[
                  "Tổng hợp các kết luận chuyên môn qua các buổi giao ban",
                  "Những vấn đề nào được nhắc lại nhiều lần?",
                  "Liệt kê các nhiệm vụ được giao và người phụ trách",
                  "So sánh cách xử trí được thảo luận giữa các buổi",
                ]}
                onCite={(src, s) => src && router.push(`/recordings/${src.recordingId}?t=${s}`)}
                className="h-[min(72vh,760px)]"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="pt-3">
          {channelId ? (
            <div className="flex h-[min(72vh,760px)] flex-col overflow-hidden rounded-xl border bg-card">
              <ChatRoom channelId={channelId} className="flex-1" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Kênh chat chưa sẵn sàng.</p>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4 pt-3">
          <InviteCard group={group} isAdmin={isAdmin} />
          {isAdmin ? <AddMember groupId={group.id} existing={members.map((m) => m.userId)} /> : null}
          <ul className="divide-y rounded-xl border bg-card">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 p-3">
                <UserAvatar name={m.name} src={m.avatar} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{[m.department, m.email].filter(Boolean).join(" • ")}</div>
                </div>
                {isAdmin && m.role !== "owner" && m.userId !== me.id ? (
                  <>
                    <Select
                      value={m.role}
                      onValueChange={async (v) => {
                        const { error } = await createClient().from("group_members").update({ role: v }).eq("group_id", group.id).eq("user_id", m.userId);
                        if (error) return toast.error(error.message);
                        router.refresh();
                      }}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Thành viên</SelectItem>
                        <SelectItem value="admin">Quản trị</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Xoá khỏi nhóm"
                      onClick={async () => {
                        if (!window.confirm(`Xoá ${m.name} khỏi nhóm?`)) return;
                        const { error } = await createClient().from("group_members").delete().eq("group_id", group.id).eq("user_id", m.userId);
                        if (error) return toast.error(error.message);
                        router.refresh();
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </>
                ) : (
                  <Badge variant={m.role === "member" ? "muted" : "secondary"}>{m.role === "owner" ? "Chủ nhóm" : m.role === "admin" ? "Quản trị" : "Thành viên"}</Badge>
                )}
              </li>
            ))}
          </ul>
          {myRole !== "owner" ? (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm("Rời nhóm này?")) return;
                const { error } = await createClient().from("group_members").delete().eq("group_id", group.id).eq("user_id", me.id);
                if (error) return toast.error(error.message);
                router.push("/groups");
                router.refresh();
              }}
            >
              <LogOutIcon /> Rời nhóm
            </Button>
          ) : null}
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="settings" className="pt-3">
            <GroupSettings group={group} isOwner={myRole === "owner"} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function InviteCard({ group, isAdmin }: { group: { id: string; inviteCode: string; inviteEnabled: boolean }; isAdmin: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const origin = useOrigin();
  const link = `${origin}/invite/${group.inviteCode}`;
  if (!group.inviteEnabled && !isAdmin) return null;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Link mời tham gia nhóm</Label>
        {isAdmin ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cho phép tham gia bằng link
            <Switch
              checked={group.inviteEnabled}
              onCheckedChange={async (v) => {
                const { error } = await createClient().from("groups").update({ invite_enabled: v }).eq("id", group.id);
                if (error) return toast.error(error.message);
                router.refresh();
              }}
            />
          </label>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />} Sao chép
        </Button>
        {isAdmin ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tạo mã mới"
            onClick={async () => {
              if (!window.confirm("Tạo mã mời mới? Link cũ sẽ hết hiệu lực.")) return;
              const { error } = await createClient().rpc("regenerate_invite_code", { p_group: group.id });
              if (error) return toast.error(error.message);
              router.refresh();
            }}
          >
            <RefreshCwIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AddMember({ groupId, existing }: { groupId: string; existing: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]>([]);
  async function search(value: string) {
    setQ(value);
    const s = value.trim().replace(/[%,()]/g, "");
    if (s.length < 2) return setResults([]);
    const { data } = await createClient()
      .from("profiles")
      .select("id,full_name,email,avatar_url")
      .eq("status", "active")
      .or(`full_name.ilike.%${s}%,email.ilike.%${s}%`)
      .limit(8);
    setResults((data ?? []).filter((u) => !existing.includes(u.id)));
  }
  async function add(userId: string) {
    const { error } = await createClient().from("group_members").insert({ group_id: groupId, user_id: userId, role: "member" });
    if (error) return toast.error(error.message);
    toast.success("Đã thêm thành viên");
    setQ("");
    setResults([]);
    router.refresh();
  }
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <Label>Thêm thành viên (người đã có tài khoản)</Label>
      <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Tìm theo tên hoặc email…" />
      {results.map((u) => (
        <button key={u.id} onClick={() => add(u.id)} className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-accent">
          <UserAvatar name={u.full_name ?? u.email} src={u.avatar_url} className="size-7" />
          <span className="flex-1 truncate">{u.full_name}</span>
          <span className="truncate text-xs text-muted-foreground">{u.email}</span>
          <PlusIcon className="size-4 text-primary" />
        </button>
      ))}
      <p className="text-xs text-muted-foreground">Người chưa có tài khoản: gửi link mời ở trên — họ đăng nhập bằng Google rồi tự tham gia.</p>
    </div>
  );
}

function ShareMyRecordingsDialog({
  open,
  onOpenChange,
  groupId,
  channelId,
  alreadyShared,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groupId: string;
  channelId: string | null;
  alreadyShared: string[];
}) {
  const router = useRouter();
  const me = useProfile();
  const [items, setItems] = useState<{ id: string; title: string; meeting_date: string | null }[] | null>(null);
  const [permission, setPermission] = useState("view");

  async function load() {
    const { data } = await createClient()
      .from("recordings")
      .select("id,title,meeting_date")
      .eq("owner_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []).filter((r) => !alreadyShared.includes(r.id)));
  }

  async function share(r: { id: string; title: string }) {
    const supabase = createClient();
    const { error } = await supabase.from("recording_shares").insert({ recording_id: r.id, group_id: groupId, permission, shared_by: me.id });
    if (error) return toast.error(error.message);
    if (channelId) {
      await supabase.from("messages").insert({ channel_id: channelId, sender_id: me.id, content: `Đã chia sẻ bản ghi “${r.title}” vào nhóm.`, recording_id: r.id });
    }
    toast.success("Đã chia sẻ");
    setItems((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) load();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chia sẻ bản ghi vào nhóm</DialogTitle>
          <DialogDescription>Chọn bản ghi của bạn. Thành viên nhóm sẽ nghe, đọc và hỏi đáp AI được.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          Quyền:
          <Select value={permission} onValueChange={setPermission}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">Chỉ xem</SelectItem>
              <SelectItem value="edit">Được sửa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {items === null ? <li className="text-sm text-muted-foreground">Đang tải…</li> : null}
          {items?.length === 0 ? <li className="text-sm text-muted-foreground">Không còn bản ghi nào để chia sẻ.</li> : null}
          {items?.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-accent">
              <AudioLinesIcon className="size-4 text-primary" />
              <span className="flex-1 truncate text-sm">{r.title}</span>
              <Button size="sm" onClick={() => share(r)}>
                Chia sẻ
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function GroupSettings({ group, isOwner }: { group: { id: string; name: string; description: string | null }; isOwner: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-4">
      <div className="space-y-1.5">
        <Label>Tên nhóm</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Mô tả</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <Button
        onClick={async () => {
          const { error } = await createClient().from("groups").update({ name: name.trim(), description: description.trim() || null }).eq("id", group.id);
          if (error) return toast.error(error.message);
          toast.success("Đã lưu");
          router.refresh();
        }}
      >
        Lưu
      </Button>
      {isOwner ? (
        <div className="border-t pt-4">
          <Button
            variant="destructive"
            onClick={async () => {
              if (!window.confirm("Xoá nhóm? Kênh chat và các lượt chia sẻ trong nhóm sẽ bị xoá (bản ghi gốc vẫn còn).")) return;
              const { error } = await createClient().from("groups").delete().eq("id", group.id);
              if (error) return toast.error(error.message);
              router.push("/groups");
              router.refresh();
            }}
          >
            <Trash2Icon /> Xoá nhóm
          </Button>
        </div>
      ) : null}
    </div>
  );
}
