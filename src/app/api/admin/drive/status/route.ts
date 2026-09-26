import { jsonError, requireApiAdmin } from "@/lib/auth";
import { getDriveAbout, type DriveSettings } from "@/lib/drive/google";
import { getSetting } from "@/lib/settings";
import { serverEnv } from "@/lib/env";

export async function GET() {
  try {
    await requireApiAdmin();
    const s = (await getSetting<DriveSettings>("drive")) ?? {};
    const configured = Boolean(serverEnv.driveRefreshToken() || s.refresh_token_enc);
    const oauthReady = Boolean(serverEnv.googleClientId() && serverEnv.googleClientSecret());
    if (!configured) return Response.json({ configured, oauthReady });
    try {
      const about = await getDriveAbout();
      return Response.json({
        configured,
        oauthReady,
        ok: true,
        email: about.user?.emailAddress ?? s.account_email,
        folderId: serverEnv.driveFolderId() ?? s.folder_id ?? null,
        quota: about.storageQuota,
        connectedAt: s.connected_at ?? null,
      });
    } catch (e) {
      return Response.json({ configured, oauthReady, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  } catch (err) {
    return jsonError(err);
  }
}
