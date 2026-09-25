import "server-only";
import { serverEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Lưu trữ tệp ghi âm trên Google Drive của MỘT tài khoản "chủ kho" (thường là tài khoản của
 * phòng/khoa) — quản trị viên kết nối một lần qua OAuth (scope drive.file). Ứng dụng tự kiểm
 * soát quyền xem/nghe theo nhóm, nên không cần chia sẻ tệp Drive cho từng người.
 */

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export interface DriveSettings {
  refresh_token_enc?: string;
  folder_id?: string;
  account_email?: string;
  connected_at?: string;
}

export function oauthClient() {
  const clientId = serverEnv.googleClientId();
  const clientSecret = serverEnv.googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET để kết nối Google Drive");
  }
  return { clientId, clientSecret };
}

export function buildDriveAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = oauthClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = oauthClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Google OAuth lỗi: ${json.error_description ?? res.statusText}`);
  }
  let email: string | undefined;
  if (json.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString("utf8"));
      email = payload.email;
    } catch {
      /* bỏ qua */
    }
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, email };
}

let cachedToken: { token: string; expiresAt: number; refresh: string } | null = null;

async function refreshToken(): Promise<string> {
  const envToken = serverEnv.driveRefreshToken();
  if (envToken) return envToken;
  const s = await getSetting<DriveSettings>("drive");
  if (!s?.refresh_token_enc) {
    throw new Error("Chưa kết nối Google Drive. Quản trị viên vào Quản trị → Lưu trữ để kết nối.");
  }
  return decryptSecret(s.refresh_token_enc);
}

/** Đã có kết nối Drive (biến môi trường hoặc quản trị viên đã kết nối) — không gọi mạng. */
export async function isDriveConfigured(): Promise<boolean> {
  if (serverEnv.driveRefreshToken()) return true;
  const s = await getSetting<DriveSettings>("drive");
  return Boolean(s?.refresh_token_enc);
}

export async function getAccessToken(): Promise<string> {
  const refresh = await refreshToken();
  if (cachedToken && cachedToken.refresh === refresh && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = oauthClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const hint =
      json.error === "invalid_grant"
        ? " (refresh token đã hết hạn/bị thu hồi — nếu ứng dụng OAuth đang ở chế độ Testing, token chỉ sống 7 ngày; hãy chuyển sang In production và kết nối lại)"
        : "";
    throw new Error(`Không lấy được access token Google Drive: ${json.error_description ?? json.error ?? res.statusText}${hint}`);
  }
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, refresh };
  return json.access_token;
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function ensureOk(res: Response, what: string) {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new Error(`Google Drive lỗi khi ${what} (${res.status}): ${body.slice(0, 300)}`);
}

export async function saveDriveConnection(refreshTokenPlain: string, email: string | undefined, userId: string) {
  const current = (await getSetting<DriveSettings>("drive")) ?? {};
  await setSetting(
    "drive",
    {
      ...current,
      refresh_token_enc: encryptSecret(refreshTokenPlain),
      account_email: email,
      connected_at: new Date().toISOString(),
    } satisfies DriveSettings,
    userId,
  );
  cachedToken = null;
}

/** Thư mục gốc lưu tệp; tự tạo "MeetingAI - Ghi âm" nếu chưa có. */
export async function ensureRootFolder(): Promise<string> {
  const envFolder = serverEnv.driveFolderId();
  if (envFolder) return envFolder;
  const s = (await getSetting<DriveSettings>("drive")) ?? {};
  if (s.folder_id) return s.folder_id;
  const res = await driveFetch(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "MeetingAI - Ghi âm", mimeType: "application/vnd.google-apps.folder" }),
  });
  await ensureOk(res, "tạo thư mục");
  const { id } = (await res.json()) as { id: string };
  await setSetting("drive", { ...s, folder_id: id });
  return id;
}

/** Tạo phiên upload resumable; trả về URL phiên (chỉ server giữ). */
export async function createResumableSession(opts: {
  name: string;
  mimeType: string;
  size: number;
  description?: string;
  appProperties?: Record<string, string>;
}): Promise<string> {
  const folder = await ensureRootFolder();
  const res = await driveFetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,mimeType,md5Checksum`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.size),
    },
    body: JSON.stringify({
      name: opts.name,
      parents: [folder],
      description: opts.description,
      appProperties: opts.appProperties,
    }),
  });
  await ensureOk(res, "tạo phiên upload");
  const location = res.headers.get("location");
  if (!location) throw new Error("Google Drive không trả về URL phiên upload");
  return location;
}

export type ChunkResult =
  | { done: false; nextOffset: number }
  | { done: true; file: { id: string; size?: string; mimeType?: string; md5Checksum?: string } };

function parseRangeEnd(range: string | null): number {
  // "bytes=0-4194303" -> 4194304 (offset kế tiếp)
  const m = range?.match(/bytes=\d+-(\d+)/);
  return m ? parseInt(m[1], 10) + 1 : 0;
}

/** Gửi một khối (bội số 256 KiB, trừ khối cuối) lên phiên resumable. */
export async function uploadChunk(
  sessionUri: string,
  data: ArrayBuffer,
  offset: number,
  total: number,
): Promise<ChunkResult> {
  const end = offset + data.byteLength - 1;
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Length": String(data.byteLength),
      "Content-Range": `bytes ${offset}-${end}/${total}`,
    },
    body: data,
  });
  if (res.status === 308) return { done: false, nextOffset: parseRangeEnd(res.headers.get("range")) };
  if (res.status === 200 || res.status === 201) return { done: true, file: await res.json() };
  await ensureOk(res, "tải khối dữ liệu");
  throw new Error("Phản hồi upload không mong đợi");
}

/** Hỏi trạng thái phiên (để tiếp tục upload sau khi mất mạng). */
export async function queryUploadStatus(sessionUri: string, total: number): Promise<ChunkResult> {
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: { "Content-Length": "0", "Content-Range": `bytes */${total}` },
  });
  if (res.status === 308) return { done: false, nextOffset: parseRangeEnd(res.headers.get("range")) };
  if (res.status === 200 || res.status === 201) return { done: true, file: await res.json() };
  if (res.status === 404) throw new Error("Phiên upload đã hết hạn — vui lòng tải lại từ đầu");
  await ensureOk(res, "kiểm tra phiên upload");
  throw new Error("Phản hồi không mong đợi");
}

/** Lấy nội dung tệp (có hỗ trợ Range) — dùng để phát audio và tải về xử lý. */
export async function fetchDriveMedia(fileId: string, range?: string | null, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers, signal });
  if (!res.ok && res.status !== 206) await ensureOk(res, "đọc tệp");
  return res;
}

export async function getDriveFileMeta(fileId: string) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,md5Checksum`);
  await ensureOk(res, "đọc thông tin tệp");
  return (await res.json()) as { id: string; name: string; size?: string; mimeType?: string; md5Checksum?: string };
}

export async function trashDriveFile(fileId: string) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (res.status === 404) return;
  await ensureOk(res, "xoá tệp");
}

export async function getDriveAbout() {
  const res = await driveFetch(`${API}/about?fields=user(emailAddress,displayName),storageQuota`);
  await ensureOk(res, "đọc thông tin tài khoản");
  return (await res.json()) as {
    user?: { emailAddress?: string; displayName?: string };
    storageQuota?: { limit?: string; usage?: string };
  };
}
