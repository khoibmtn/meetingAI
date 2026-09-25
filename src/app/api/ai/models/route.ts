import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { listModels } from "@/lib/ai";
import { getConnectionRow } from "@/lib/ai/connections";
import { decryptSecret } from "@/lib/crypto";
import { PROVIDERS, type ProviderKind } from "@/lib/ai/catalog";

export const maxDuration = 60;

/** Tải danh sách mô hình hiện có trực tiếp từ API nhà cung cấp. */
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireApiUser();
    const body = (await request.json()) as { id?: string; provider: ProviderKind; baseUrl?: string | null; apiKey?: string | null };
    if (!PROVIDERS[body.provider]) throw new HttpError(400, "Nhà cung cấp không hợp lệ");
    let apiKey = body.apiKey?.trim() || "";
    if (!apiKey && body.id) {
      const row = await getConnectionRow(body.id);
      const allowed = row && (row.scope === "org" ? profile.role === "admin" : row.user_id === user.id);
      if (!row || !allowed) throw new HttpError(403, "Không có quyền dùng khoá của kết nối này");
      apiKey = decryptSecret(row.encrypted_key);
    }
    if (!apiKey) throw new HttpError(400, "Nhập API key để tải danh sách mô hình");
    const models = await listModels({ provider: body.provider, baseUrl: body.baseUrl, apiKey });
    return Response.json({ models });
  } catch (err) {
    return jsonError(err);
  }
}
