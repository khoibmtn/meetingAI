"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogInIcon, PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function GroupActions() {
  const router = useRouter();
  const me = useProfile();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient()
      .from("groups")
      .insert({ name: name.trim(), description: description.trim() || null, owner_id: me.id })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Không tạo được nhóm");
    toast.success("Đã tạo nhóm");
    router.push(`/groups/${data.id}`);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().split("/").pop() ?? "";
    setBusy(true);
    const { data, error } = await createClient().rpc("join_group_by_code", { p_code: c });
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Mã mời không hợp lệ");
    toast.success("Đã tham gia nhóm");
    router.push(`/groups/${data}`);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setJoinOpen(true)}>
        <LogInIcon /> Nhập mã mời
      </Button>
      <Button onClick={() => setCreateOpen(true)}>
        <PlusIcon /> Tạo nhóm
      </Button>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Tạo nhóm</DialogTitle>
              <DialogDescription>Ví dụ: Khoa Gây mê hồi sức, Phòng KHTH, Hội đồng chuyên môn.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Tên nhóm</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Mô tả</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !name.trim()}>
                Tạo nhóm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <form onSubmit={join} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Tham gia nhóm</DialogTitle>
              <DialogDescription>Dán mã mời hoặc đường link mời nhận từ quản trị nhóm.</DialogDescription>
            </DialogHeader>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: 3f9a1c2b7d4e" required />
            <DialogFooter>
              <Button type="submit" disabled={busy || !code.trim()}>
                Tham gia
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
