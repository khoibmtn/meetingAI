import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { GroupWorkspace } from "@/components/groups/group-workspace";

export async function generateMetadata({ params }: PageProps<"/groups/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Nhóm" };
}

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const { data: group } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
  if (!group) notFound();
  const [{ data: members }, { data: shares }, { data: channel }] = await Promise.all([
    supabase.from("group_members").select("user_id, role, joined_at, profiles(full_name,email,avatar_url,title,department)").eq("group_id", id),
    supabase
      .from("recording_shares")
      .select("id, permission, created_at, shared_by, recordings(id,title,category,meeting_date,duration_sec,status,owner_id,transcripts(recording_id))")
      .eq("group_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("channels").select("id").eq("group_id", id).maybeSingle(),
  ]);
  const myRole = members?.find((m) => m.user_id === user.id)?.role ?? "member";

  return (
    <GroupWorkspace
      group={{
        id: group.id,
        name: group.name,
        description: group.description,
        inviteCode: group.invite_code,
        inviteEnabled: group.invite_enabled,
        ownerId: group.owner_id,
      }}
      myRole={myRole}
      channelId={channel?.id ?? null}
      members={(members ?? []).map((m) => {
        const p = m.profiles as { full_name: string | null; email: string | null; avatar_url: string | null; title: string | null; department: string | null } | null;
        return { userId: m.user_id, role: m.role, joinedAt: m.joined_at, name: p?.full_name ?? p?.email ?? "—", email: p?.email ?? null, avatar: p?.avatar_url ?? null, department: p?.department ?? null };
      })}
      recordings={(shares ?? [])
        .map((s) => {
          const r = s.recordings as unknown as {
            id: string;
            title: string;
            category: string;
            meeting_date: string | null;
            duration_sec: number | null;
            status: string;
            owner_id: string;
            transcripts: { recording_id: string } | { recording_id: string }[] | null;
          } | null;
          if (!r) return null;
          const hasTranscript = Array.isArray(r.transcripts) ? r.transcripts.length > 0 : Boolean(r.transcripts);
          return { shareId: s.id, permission: s.permission, sharedAt: s.created_at, sharedBy: s.shared_by, ...r, duration_sec: r.duration_sec ? Number(r.duration_sec) : null, hasTranscript };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r))}
    />
  );
}
