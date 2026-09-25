import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireApiAdmin } from "@/lib/auth";
import { buildDriveAuthUrl } from "@/lib/drive/google";
import { signToken } from "@/lib/crypto";
import { resolveBaseUrl } from "@/lib/transcription/pipeline";

/** Quản trị viên bắt đầu kết nối Google Drive (OAuth, scope drive.file). */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireApiAdmin();
    const base = resolveBaseUrl(request.url);
    const state = signToken(JSON.stringify({ uid: user.id, ts: Date.now() }));
    return NextResponse.redirect(buildDriveAuthUrl(`${base}/api/admin/drive/callback`, state));
  } catch (err) {
    return jsonError(err);
  }
}
