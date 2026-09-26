import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { GroupActions } from "./group-actions";

export const metadata: Metadata = { title: "Nhóm" };

export default async function GroupsPage() {
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_members")
    .select("role, groups(id, name, description, created_at, group_members(count), recording_shares(count))")
    .eq("user_id", user.id);
  const groups = (data ?? [])
    .map((m) => {
      const g = m.groups as unknown as {
        id: string;
        name: string;
        description: string | null;
        group_members: { count: number }[];
        recording_shares: { count: number }[];
      } | null;
      return g ? { ...g, role: m.role, members: g.group_members?.[0]?.count ?? 0, recordings: g.recording_shares?.[0]?.count ?? 0 } : null;
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <PageContainer>
      <PageHeader title="Nhóm" description="Chia sẻ bản ghi, cùng hỏi đáp AI và trò chuyện theo khoa/phòng, tổ chuyên môn." actions={<GroupActions />} />
      {groups.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Bạn chưa tham gia nhóm nào"
          description="Tạo nhóm cho khoa/phòng của bạn hoặc nhập mã mời từ đồng nghiệp."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <UsersIcon className="size-5" />
                  </div>
                  {g.role !== "member" ? <Badge variant="secondary">{g.role === "owner" ? "Chủ nhóm" : "Quản trị"}</Badge> : null}
                </div>
                <div className="font-semibold">{g.name}</div>
                {g.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{g.description}</p> : null}
                <div className="mt-auto text-xs text-muted-foreground">
                  {g.members} thành viên • {g.recordings} bản ghi
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
