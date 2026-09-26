import { type NextRequest } from "next/server";
import { jsonError, requireApiAdmin, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Quản trị viên đổi vai trò / trạng thái tài khoản (duyệt, khoá). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireApiAdmin();
    const body = (await request.json()) as { role?: "admin" | "member"; status?: "active" | "pending" | "disabled" };
    if (id === user.id && (body.role === "member" || (body.status && body.status !== "active"))) {
      throw new HttpError(400, "Không thể tự hạ quyền hoặc khoá chính mình");
    }
    const patch: { role?: string; status?: string } = {};
    if (body.role && ["admin", "member"].includes(body.role)) patch.role = body.role;
    if (body.status && ["active", "pending", "disabled"].includes(body.status)) patch.status = body.status;
    const { error } = await createAdminClient().from("profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
