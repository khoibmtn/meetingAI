import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { ConnectionsManager } from "@/components/ai/connections-manager";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const { profile } = await requirePageUser();
  return (
    <PageContainer>
      <PageHeader title="Cài đặt cá nhân" description="Hồ sơ, kết nối AI riêng và lựa chọn mô hình cho từng tác vụ." />
      <ProfileForm profile={{ full_name: profile.full_name, title: profile.title, department: profile.department, email: profile.email }} />
      <section id="ai" className="scroll-mt-20">
        <ConnectionsManager scope="user" />
      </section>
    </PageContainer>
  );
}
