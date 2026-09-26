import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_GLOSSARY, type GlossaryEntry } from "./glossary-defaults";

/**
 * Tập thuật ngữ áp dụng cho một bản ghi: mặc định + toàn hệ thống + nhóm được chia sẻ
 * + cá nhân (người tạo và chủ sở hữu). Thuật ngữ cụ thể hơn đặt trước.
 */
export async function loadGlossaryForRecording(recordingId: string, userIds: string[]): Promise<GlossaryEntry[]> {
  const admin = createAdminClient();
  const { data: shares } = await admin.from("recording_shares").select("group_id").eq("recording_id", recordingId);
  const groupIds = (shares ?? []).map((s) => s.group_id).filter((g): g is string => Boolean(g));

  const filters = [`scope.eq.org`];
  if (groupIds.length) filters.push(`and(scope.eq.group,group_id.in.(${groupIds.join(",")}))`);
  const users = [...new Set(userIds.filter(Boolean))];
  if (users.length) filters.push(`and(scope.eq.user,user_id.in.(${users.join(",")}))`);

  const { data } = await admin
    .from("glossary_terms")
    .select("term, aliases, category, scope")
    .or(filters.join(","))
    .limit(1000);

  const rank = { user: 0, group: 1, org: 2 } as Record<string, number>;
  const custom = (data ?? [])
    .sort((a, b) => (rank[a.scope] ?? 3) - (rank[b.scope] ?? 3))
    .map((t) => ({ term: t.term, aliases: t.aliases ?? [], category: t.category ?? undefined }));
  return [...custom, ...DEFAULT_GLOSSARY];
}
