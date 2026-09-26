import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import {
  getAssignments,
  getConnectionRow,
  listAccessibleConnections,
  saveConnection,
  toSummary,
  type ConnectionInput,
} from "@/lib/ai/connections";

/** Danh sách kết nối AI người dùng thấy được (không có khoá) + phân công hiện tại. */
export async function GET() {
  try {
    const { user, profile } = await requireApiUser();
    const rows = await listAccessibleConnections(user.id);
    const assignments = await getAssignments(user.id);
    return Response.json({
      connections: rows.map((r) => toSummary(r, user.id)),
      assignments,
      isAdmin: profile.role === "admin",
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Tạo/sửa kết nối. Kết nối của tổ chức chỉ quản trị viên được tạo/sửa. */
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireApiUser();
    const input = (await request.json()) as ConnectionInput;
    if (input.id) {
      const existing = await getConnectionRow(input.id);
      if (!existing) throw new HttpError(404, "Không tìm thấy kết nối");
      const allowed =
        (existing.scope === "org" && profile.role === "admin") || (existing.scope === "user" && existing.user_id === user.id);
      if (!allowed) throw new HttpError(403, "Không có quyền sửa kết nối này");
      input.scope = existing.scope as "org" | "user";
    } else if (input.scope === "org" && profile.role !== "admin") {
      throw new HttpError(403, "Chỉ quản trị viên được tạo kết nối dùng chung");
    }
    const row = await saveConnection({ ...input, scope: input.scope === "org" ? "org" : "user" }, user.id);
    return Response.json({ connection: toSummary(row, user.id) });
  } catch (err) {
    return jsonError(err);
  }
}
