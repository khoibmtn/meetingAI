import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { testConnection } from "@/lib/ai";
import { getConnectionRow, recordConnectionStatus, sanitizeParams } from "@/lib/ai/connections";
import { decryptSecret } from "@/lib/crypto";
import { baseUrlError, type ModelParams, type ProviderKind } from "@/lib/ai/catalog";

export const maxDuration = 90;

interface Body {
  id?: string;
  provider: ProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  model: string;
  params?: ModelParams;
}

/**
 * Kiểm tra kết nối với giá trị đang nhập trên form (chưa cần lưu). Nếu là kết nối đã lưu
 * và không nhập khoá mới → dùng khoá đã lưu; kết quả được ghi lại vào trạng thái kết nối.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireApiUser();
    const body = (await request.json()) as Body;
    const urlError = baseUrlError(body.baseUrl);
    if (urlError) throw new HttpError(400, urlError);
    let apiKey = body.apiKey?.trim() || "";
    let savedId: string | undefined;
    if (body.id) {
      const row = await getConnectionRow(body.id);
      if (!row) throw new HttpError(404, "Không tìm thấy kết nối");
      const allowed = row.scope === "org" ? profile.role === "admin" || !body.apiKey : row.user_id === user.id;
      if (!allowed) throw new HttpError(403, "Không có quyền kiểm tra kết nối này");
      if (!apiKey) apiKey = decryptSecret(row.encrypted_key);
      // Chỉ ghi trạng thái khi kiểm tra đúng cấu hình đã lưu
      const same =
        !body.apiKey &&
        row.provider === body.provider &&
        (row.base_url ?? "") === (body.baseUrl?.trim() ?? "") &&
        row.model === body.model;
      if (same) savedId = row.id;
    }
    if (!apiKey) throw new HttpError(400, "Cần nhập API key");
    const result = await testConnection({
      provider: body.provider,
      baseUrl: body.baseUrl,
      apiKey,
      model: body.model,
      params: sanitizeParams(body.params, body.model),
    });
    if (savedId) await recordConnectionStatus(savedId, result);
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
