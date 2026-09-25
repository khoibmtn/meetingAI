import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { AdminTabs } from "./admin-tabs";

export const metadata: Metadata = { title: "Quản trị" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { profile } = await requirePageUser();
  if (profile.role !== "admin") redirect("/recordings");
  const sp = await searchParams;
  const { data: users } = await createAdminClient()
    .from("profiles")
    .select("id,email,full_name,title,department,role,status,created_at,avatar_url")
    .order("created_at");
  return (
    <PageContainer>
      <PageHeader title="Quản trị hệ thống" description="Kết nối AI, lưu trữ Google Drive, thông tin đơn vị và người dùng." />
      <AdminTabs
        initialTab={typeof sp.tab === "string" ? sp.tab : "ai"}
        users={users ?? []}
        driveNotice={typeof sp.drive === "string" ? "connected" : typeof sp.drive_error === "string" ? sp.drive_error : null}
      />
    </PageContainer>
  );
}
