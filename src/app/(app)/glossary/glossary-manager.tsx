"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDownIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/profile-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_GLOSSARY } from "@/lib/transcription/glossary-defaults";
import { stripDiacritics } from "@/lib/utils";

type Term = Tables<"glossary_terms">;

/** "Esmeron | ét mê rôn, ếch mê rông | thuốc" → {term, aliases, category} */
export function parseGlossaryLine(line: string) {
  const [term, aliases, category] = line.split("|").map((s) => s.trim());
  if (!term) return null;
  return {
    term,
    aliases: (aliases ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    category: category || null,
  };
}

export function GlossaryManager({ initial, groups }: { initial: Term[]; groups: { id: string; name: string; role: string }[] }) {
  const me = useProfile();
  const [terms, setTerms] = useState(initial);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"user" | "group" | "org">("user");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const [category, setCategory] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [showDefaults, setShowDefaults] = useState(false);

  const filtered = useMemo(() => {
    const s = stripDiacritics(q.trim().toLowerCase());
    return s ? terms.filter((t) => stripDiacritics(`${t.term} ${t.aliases.join(" ")} ${t.category ?? ""}`.toLowerCase()).includes(s)) : terms;
  }, [terms, q]);

  function row(t: { term: string; aliases: string[]; category: string | null }) {
    return {
      scope,
      term: t.term,
      aliases: t.aliases,
      category: t.category,
      created_by: me.id,
      user_id: scope === "user" ? me.id : null,
      group_id: scope === "group" ? groupId : null,
    };
  }

  async function add() {
    if (!term.trim()) return;
    const { data, error } = await createClient()
      .from("glossary_terms")
      .insert(row({ term: term.trim(), aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), category: category.trim() || null }))
      .select("*")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Không lưu được");
    setTerms((t) => [...t, data].sort((a, b) => a.term.localeCompare(b.term, "vi")));
    setTerm("");
    setAliases("");
  }

  async function importBulk() {
    const rows = importText.split("\n").map(parseGlossaryLine).filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (!rows.length) return toast.error("Không có dòng hợp lệ");
    const { data, error } = await createClient().from("glossary_terms").insert(rows.map(row)).select("*");
    if (error) return toast.error(error.message);
    setTerms((t) => [...t, ...(data ?? [])].sort((a, b) => a.term.localeCompare(b.term, "vi")));
    toast.success(`Đã thêm ${data?.length ?? 0} thuật ngữ`);
    setImportOpen(false);
    setImportText("");
  }

  async function remove(t: Term) {
    if (!window.confirm(`Xoá thuật ngữ “${t.term}”?`)) return;
    const { error } = await createClient().from("glossary_terms").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    setTerms((cur) => cur.filter((x) => x.id !== t.id));
  }

  const scopeLabel = (t: Term) => (t.scope === "org" ? "Toàn đơn vị" : t.scope === "group" ? (groups.find((g) => g.id === t.group_id)?.name ?? "Nhóm") : "Cá nhân");
  const canDelete = (t: Term) =>
    (t.scope === "user" && t.user_id === me.id) ||
    (t.scope === "org" && me.role === "admin") ||
    (t.scope === "group" && (t.created_by === me.id || groups.some((g) => g.id === t.group_id && g.role !== "member")));

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
          <div className="space-y-1.5">
            <Label>Thuật ngữ / tên đúng chính tả</Label>
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="VD: Esmeron, BS. Nguyễn Văn Hiển" />
          </div>
          <div className="space-y-1.5">
            <Label>Cách đọc/nghe nhầm (cách nhau bởi dấu phẩy)</Label>
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="ét mê rôn, ếch mê rông" />
          </div>
          <div className="space-y-1.5">
            <Label>Nhóm từ</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="thuốc, nhân sự…" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Cá nhân</SelectItem>
              {groups.length ? <SelectItem value="group">Nhóm</SelectItem> : null}
              {me.role === "admin" ? <SelectItem value="org">Toàn đơn vị</SelectItem> : null}
            </SelectContent>
          </Select>
          {scope === "group" ? (
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button size="sm" onClick={add} disabled={!term.trim()}>
            <PlusIcon /> Thêm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <UploadIcon /> Nhập hàng loạt
          </Button>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm trong ${terms.length} thuật ngữ…`} className="pl-9" />
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {filtered.length === 0 ? <li className="p-4 text-sm text-muted-foreground">Chưa có thuật ngữ tuỳ chỉnh.</li> : null}
        {filtered.map((t) => (
          <li key={t.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.term}</div>
              {t.aliases.length ? <div className="truncate text-xs text-muted-foreground">nghe như: {t.aliases.join(", ")}</div> : null}
            </div>
            {t.category ? <Badge variant="outline">{t.category}</Badge> : null}
            <Badge variant="secondary">{scopeLabel(t)}</Badge>
            {canDelete(t) ? (
              <Button size="icon-sm" variant="ghost" onClick={() => remove(t)} aria-label="Xoá">
                <Trash2Icon />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="rounded-xl border bg-card">
        <button className="flex w-full items-center justify-between p-3 text-sm font-medium" onClick={() => setShowDefaults((v) => !v)}>
          Từ điển mặc định của hệ thống ({DEFAULT_GLOSSARY.length} thuật ngữ y khoa, ưu tiên Gây mê hồi sức)
          <ChevronDownIcon className={`size-4 transition ${showDefaults ? "rotate-180" : ""}`} />
        </button>
        {showDefaults ? (
          <div className="flex flex-wrap gap-1.5 border-t p-3">
            {DEFAULT_GLOSSARY.map((g) => (
              <Badge key={g.term} variant="outline" title={g.aliases?.join(", ")}>
                {g.term}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nhập hàng loạt</DialogTitle>
            <DialogDescription>Mỗi dòng: Thuật ngữ | cách đọc 1, cách đọc 2 | nhóm từ (hai phần sau có thể bỏ trống).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={"Esmeron | ét mê rôn | thuốc\nBS. Nguyễn Văn Hiển | thầy Hiển | nhân sự\nERAS"}
          />
          <DialogFooter>
            <Button onClick={importBulk}>Nhập</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
