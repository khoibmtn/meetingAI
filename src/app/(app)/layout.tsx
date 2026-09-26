import { requirePageUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requirePageUser();
  return (
    <AppShell
      profile={{
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        title: profile.title,
        department: profile.department,
        avatar_url: profile.avatar_url,
        role: profile.role,
        status: profile.status,
      }}
    >
      {children}
    </AppShell>
  );
}
