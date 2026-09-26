import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { GlossaryManager } from "./glossary-manager";

export const metadata: Metadata = { title: "Từ điển thuật ngữ" };

export default async function GlossaryPage() {
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const [{ data: terms }, { data: memberships }] = await Promise.all([
    supabase.from("glossary_terms").select("*").order("term"),
    supabase.from("group_members").select("role, groups(id,name)").eq("user_id", user.id),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Từ điển thuật ngữ & tên riêng"
        description="Giúp AI viết đúng tên thuốc, thuật ngữ, viết tắt, tên đồng nghiệp khi phiên âm và hiệu đính."
      />
      <GlossaryManager
        initial={terms ?? []}
        groups={(memberships ?? [])
          .map((m) => ({ ...(m.groups as { id: string; name: string } | null), role: m.role }))
          .filter((g): g is { id: string; name: string; role: string } => Boolean(g.id))}
      />
    </PageContainer>
  );
}
