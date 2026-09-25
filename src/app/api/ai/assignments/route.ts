import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { setAssignment } from "@/lib/ai/connections";
import { USAGES, type Usage } from "@/lib/ai/catalog";

/** Phân công kết nối cho một vị trí sử dụng AI (toàn hệ thống: quản trị viên; cá nhân: chính mình). */
export async function PUT(request: NextRequest) {
  try {
    const { user, profile } = await requireApiUser();
    const body = (await request.json()) as { scope: "org" | "user"; usage: Usage; connectionId: string | null };
    if (!USAGES.some((u) => u.id === body.usage)) throw new HttpError(400, "Vị trí sử dụng không hợp lệ");
    if (body.scope === "org" && profile.role !== "admin") throw new HttpError(403, "Chỉ quản trị viên được phân công toàn hệ thống");
    await setAssignment(body.scope === "org" ? "org" : "user", body.scope === "org" ? null : user.id, body.usage, body.connectionId);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
