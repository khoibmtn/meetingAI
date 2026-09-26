import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { getConnectionRow } from "@/lib/ai/connections";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, profile } = await requireApiUser();
    const row = await getConnectionRow(id);
    if (!row) throw new HttpError(404, "Không tìm thấy kết nối");
    const allowed = (row.scope === "org" && profile.role === "admin") || (row.scope === "user" && row.user_id === user.id);
    if (!allowed) throw new HttpError(403, "Không có quyền xoá kết nối này");
    const { error } = await createAdminClient().from("ai_connections").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
