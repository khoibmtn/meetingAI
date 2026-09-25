"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Share2Icon, Trash2Icon, UserIcon, UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/avatar";
import { useProfile } from "@/components/profile-context";

interface ShareRow {
  id: string;
  group_id: string | null;
  user_id: string | null;
  permission: string;
  groupName?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}

export function ShareDialog({ recordingId, recordingTitle, isOwner }: { recordingId: string; recordingTitle: string; isOwner: boolean }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [permission, setPermission] = useState("view");
  const [announce, setAnnounce] = useState(true);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]>([]);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("recording_shares")
      .select("id, group_id, user_id, permission, groups(name), profiles:user_id(full_name,email)")
      .eq("recording_id", recordingId);
    setShares(
      (data ?? []).map((s) => ({
        id: s.id,
        group_id: s.group_id,
        user_id: s.user_id,
        permission: s.permission,
        groupName: (s.groups as { name: string } | null)?.name,
        userName: (s.profiles as { full_name: string | null } | null)?.full_name,
        userEmail: (s.profiles as { email: string | null } | null)?.email,
      })),
    );
    const { data: gm } = await supabase.from("group_members").select("groups(id,name)").eq("user_id", profile.id);
    setGroups((gm ?? []).map((g) => g.groups as { id: string; name: string } | null).filter((g): g is { id: string; name: string } => Boolean(g)));
  }

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) load();
  }

  const q = userQuery.trim();
  const visibleResults = q.length >= 2 ? userResults : [];
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      const { data } = await createClient()
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`)
        .neq("id", profile.id)
        .eq("status", "active")
        .limit(8);
      setUserResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, profile.id]);

  async function shareGroup() {
    if (!groupId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("recording_shares")
      .insert({ recording_id: recordingId, group_id: groupId, permission, shared_by: profile.id });
    if (error) return toast.error(error.code === "23505" ? "Đã chia sẻ vào nhóm này rồi" : error.message);
    if (announce) {
      const { data: ch } = await supabase.from("channels").select("id").eq("group_id", groupId).maybeSingle();
      if (ch) {
        await supabase.from("messages").insert({
          channel_id: ch.id,
          sender_id: profile.id,
          content: `Đã chia sẻ bản ghi “${recordingTitle}” vào nhóm.`,
          recording_id: recordingId,
        });
      }
    }
    toast.success("Đã chia sẻ vào nhóm");
    setGroupId("");
    load();
  }

  async function shareUser(userId: string) {
    const { error } = await createClient()
      .from("recording_shares")
      .insert({ recording_id: recordingId, user_id: userId, permission, shared_by: profile.id });
    if (error) return toast.error(error.code === "23505" ? "Đã chia sẻ với người này rồi" : error.message);
    toast.success("Đã chia sẻ");
    setUserQuery("");
    load();
  }

  async function setPerm(id: string, perm: string) {
    const { error } = await createClient().from("recording_shares").update({ permission: perm }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function unshare(id: string) {
    const { error } = await createClient().from("recording_shares").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2Icon /> Chia sẻ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Chia sẻ bản ghi</DialogTitle>
          <DialogDescription>
            Thành viên được chia sẻ có thể nghe âm thanh, xem transcript, các văn bản tổng hợp và hỏi đáp AI. Quyền “Sửa” cho phép hiệu đính transcript.
          </DialogDescription>
        </DialogHeader>
        {isOwner ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="flex items-center gap-2">
                <UsersIcon className="size-4" /> Chia sẻ vào nhóm
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger className="w-full sm:flex-1">
                    <SelectValue placeholder={groups.length ? "Chọn nhóm" : "Bạn chưa tham gia nhóm nào"} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PermissionSelect value={permission} onChange={setPermission} />
                <Button onClick={shareGroup} disabled={!groupId}>
                  Chia sẻ
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={announce} onCheckedChange={setAnnounce} /> Thông báo vào kênh chat của nhóm
              </label>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="flex items-center gap-2">
                <UserIcon className="size-4" /> Chia sẻ với một người
              </Label>
              <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Tìm theo tên hoặc email…" />
              {visibleResults.map((u) => (
                <button key={u.id} onClick={() => shareUser(u.id)} className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-accent">
                  <UserAvatar name={u.full_name ?? u.email} src={u.avatar_url} className="size-7" />
                  <span className="flex-1 truncate">{u.full_name}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Đang chia sẻ với</Label>
          {shares.length === 0 ? <p className="text-sm text-muted-foreground">Chưa chia sẻ.</p> : null}
          <ul className="divide-y rounded-lg border">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-2 p-2 text-sm">
                {s.group_id ? <UsersIcon className="size-4 text-primary" /> : <UserIcon className="size-4 text-primary" />}
                <span className="min-w-0 flex-1 truncate">{s.groupName ?? s.userName ?? s.userEmail}</span>
                {isOwner ? (
                  <>
                    <PermissionSelect value={s.permission} onChange={(v) => setPerm(s.id, v)} />
                    <Button size="icon-sm" variant="ghost" onClick={() => unshare(s.id)} aria-label="Bỏ chia sẻ">
                      <Trash2Icon />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{s.permission === "edit" ? "Được sửa" : "Chỉ xem"}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-28" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="view">Chỉ xem</SelectItem>
        <SelectItem value="edit">Được sửa</SelectItem>
      </SelectContent>
    </Select>
  );
}
