import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { ensureRootFolder, exchangeCode, saveDriveConnection } from "@/lib/drive/google";
import { verifyToken } from "@/lib/crypto";
import { resolveBaseUrl } from "@/lib/transcription/pipeline";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const base = resolveBaseUrl(request.url);
  const fail = (msg: string) => NextResponse.redirect(`${base}/admin?tab=storage&drive_error=${encodeURIComponent(msg)}`);
  try {
    const { user } = await requireApiAdmin();
    const raw = verifyToken(url.searchParams.get("state") ?? "");
    const state = raw ? (JSON.parse(raw) as { uid: string; ts: number }) : null;
    if (!state || state.uid !== user.id || Date.now() - state.ts > 15 * 60_000) return fail("Phiên kết nối không hợp lệ hoặc đã hết hạn");
    const code = url.searchParams.get("code");
    if (!code) return fail(url.searchParams.get("error") ?? "Thiếu mã xác thực");
    const tokens = await exchangeCode(code, `${base}/api/admin/drive/callback`);
    if (!tokens.refreshToken) {
      return fail("Google không trả về refresh token. Hãy gỡ quyền ứng dụng tại myaccount.google.com/permissions rồi kết nối lại.");
    }
    await saveDriveConnection(tokens.refreshToken, tokens.email, user.id);
    await ensureRootFolder();
    return NextResponse.redirect(`${base}/admin?tab=storage&drive=connected`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
