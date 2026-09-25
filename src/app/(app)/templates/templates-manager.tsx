"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, FileTextIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, categoryLabel } from "@/components/recordings/category";
import { SYSTEM_TEMPLATES } from "@/lib/reports/templates";

type Template = Tables<"templates">;

interface Draft {
  id?: string;
  name: string;
  description: string;
  category: string;
  prompt: string;
  scope: "user" | "group" | "org";
  groupId: string;
}

const EMPTY: Draft = { name: "", description: "", category: "chung", prompt: "", scope: "user", groupId: "" };

export function TemplatesManager({ templates, groups }: { templates: Template[]; groups: { id: string; name: string; role: string }[] }) {
  const me = useProfile();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<{ name: string; prompt: string } | null>(null);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.prompt.trim()) return toast.error("Cần tên và nội dung hướng dẫn");
    const supabase = createClient();
    const base = { name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, prompt: draft.prompt.trim() };
    const { error } = draft.id
      ? await supabase.from("templates").update(base).eq("id", draft.id)
      : await supabase.from("templates").insert({
          ...base,
          scope: draft.scope,
          owner_id: me.id,
          group_id: draft.scope === "group" ? draft.groupId || null : null,
        });
    if (error) return toast.error(error.message);
    toast.success("Đã lưu template");
    setDraft(null);
    router.refresh();
  }

  async function remove(t: Template) {
    if (!window.confirm(`Xoá template “${t.name}”?`)) return;
    const { error } = await createClient().from("templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    router.refresh();
  }

  const canModify = (t: Template) =>
    t.owner_id === me.id || (t.scope === "org" && me.role === "admin") || (t.scope === "group" && groups.some((g) => g.id === t.group_id && g.role !== "member"));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Template tuỳ chỉnh</h2>
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <PlusIcon /> Tạo template
          </Button>
        </div>
        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Chưa có template tuỳ chỉnh. Có thể nhân bản một template hệ thống bên dưới rồi chỉnh theo quy định của đơn vị.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  <FileTextIcon className="mt-0.5 size-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                  <Badge variant="secondary">
                    {t.scope === "org" ? "Toàn đơn vị" : t.scope === "group" ? (groups.find((g) => g.id === t.group_id)?.name ?? "Nhóm") : "Cá nhân"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">Loại: {t.category === "chung" ? "Chung" : categoryLabel(t.category)}</div>
                <div className="mt-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing({ name: t.name, prompt: t.prompt })}>
                    Xem
                  </Button>
                  {canModify(t) ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            id: t.id,
                            name: t.name,
                            description: t.description ?? "",
                            category: t.category,
                            prompt: t.prompt,
                            scope: t.scope as Draft["scope"],
                            groupId: t.group_id ?? "",
                          })
                        }
                      >
                        <PencilIcon /> Sửa
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(t)}>
                        <Trash2Icon />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <LockIcon className="size-4" /> Template hệ thống
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {SYSTEM_TEMPLATES.map((t) => (
            <li key={t.key} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
              <div className="flex flex-wrap gap-1">
                {t.categories.map((c) => (
                  <Badge key={c} variant="outline" className="text-[11px]">
                    {categoryLabel(c)}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setViewing({ name: t.name, prompt: t.prompt })}>
                  Xem
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...EMPTY, name: `${t.name} (bản của tôi)`, description: t.description, category: t.categories[0] ?? "chung", prompt: t.prompt })
                  }
                >
                  <CopyIcon /> Nhân bản để tuỳ chỉnh
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{viewing?.prompt}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Sửa template" : "Tạo template"}</DialogTitle>
            <DialogDescription>
              Viết hướng dẫn cho AI: cấu trúc văn bản, các mục bắt buộc, văn phong. AI luôn chỉ dùng thông tin trong transcript. Có thể dùng
              biến {"{{ORG_NAME}}"}, {"{{ORG_PARENT}}"}, {"{{ORG_SHORT}}"}.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Tên</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Loại cuộc họp</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chung">Chung</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phạm vi</Label>
                <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: v as Draft["scope"] })} disabled={!!draft.id}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Cá nhân</SelectItem>
                    {groups.length ? <SelectItem value="group">Nhóm</SelectItem> : null}
                    {me.role === "admin" ? <SelectItem value="org">Toàn đơn vị</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              {draft.scope === "group" && !draft.id ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nhóm</Label>
                  <Select value={draft.groupId} onValueChange={(v) => setDraft({ ...draft, groupId: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn nhóm" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Mô tả ngắn</Label>
                <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Hướng dẫn cho AI</Label>
                <Textarea value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} rows={14} className="font-mono text-xs" />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Huỷ
            </Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
