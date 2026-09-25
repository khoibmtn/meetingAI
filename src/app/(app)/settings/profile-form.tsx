"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ profile }: { profile: { full_name: string | null; title: string | null; department: string | null; email: string | null } }) {
  const me = useProfile();
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [title, setTitle] = useState(profile.title ?? "");
  const [department, setDepartment] = useState(profile.department ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ full_name: fullName.trim() || null, title: title.trim() || null, department: department.trim() || null })
      .eq("id", me.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Đã lưu hồ sơ");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hồ sơ</CardTitle>
        <CardDescription>{profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Họ và tên</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Chức danh</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="BS, ThS.BS, CN…" />
          </div>
          <div className="space-y-1.5">
            <Label>Khoa / phòng</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={saving}>
              Lưu hồ sơ
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
