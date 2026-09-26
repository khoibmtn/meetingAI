import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { TemplatesManager } from "./templates-manager";

export const metadata: Metadata = { title: "Template tổng hợp" };

export default async function TemplatesPage() {
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const [{ data: templates }, { data: memberships }] = await Promise.all([
    supabase.from("templates").select("*").order("sort_order").order("name"),
    supabase.from("group_members").select("role, groups(id,name)").eq("user_id", user.id),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Template tổng hợp"
        description="Mẫu hướng dẫn AI soạn văn bản từ transcript. Tạo mẫu riêng cho cá nhân, nhóm hoặc toàn đơn vị."
      />
      <TemplatesManager
        templates={templates ?? []}
        groups={(memberships ?? [])
          .map((m) => ({ ...(m.groups as { id: string; name: string } | null), role: m.role }))
          .filter((g): g is { id: string; name: string; role: string } => Boolean(g.id))}
      />
    </PageContainer>
  );
}
