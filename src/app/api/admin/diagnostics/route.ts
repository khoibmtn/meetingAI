import type { NextRequest } from "next/server";
import { jsonError, requireApiAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveAbout, isDriveConfigured } from "@/lib/drive/google";
import { serverEnv } from "@/lib/env";
import { resolveBaseUrl } from "@/lib/transcription/jobs";
import { resolveConnection } from "@/lib/ai/connections";
import { PROVIDERS, USAGES } from "@/lib/ai/catalog";

export const maxDuration = 60;

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Kiểm tra hệ thống cho quản trị viên: CSDL, Google Drive, worker (ffmpeg) và kết nối AI theo vị trí. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireApiAdmin();
    const checks: Check[] = [];

    const db = await createAdminClient().from("profiles").select("id", { count: "exact", head: true });
    checks.push({
      key: "db",
      label: "Cơ sở dữ liệu",
      ok: !db.error,
      detail: db.error ? db.error.message : `Hoạt động — ${db.count ?? 0} tài khoản`,
    });

    if (!(await isDriveConfigured())) {
      const oauthReady = Boolean(serverEnv.googleClientId() && serverEnv.googleClientSecret());
      checks.push({
        key: "drive",
        label: "Google Drive",
        ok: false,
        detail: oauthReady
          ? "Chưa kết nối — mở tab Lưu trữ và bấm “Kết nối Google Drive”"
          : "Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trên Vercel",
      });
    } else {
      try {
        const about = await getDriveAbout();
        checks.push({ key: "drive", label: "Google Drive", ok: true, detail: `Đã kết nối: ${about.user?.emailAddress ?? "tài khoản Google"}` });
      } catch (e) {
        checks.push({ key: "drive", label: "Google Drive", ok: false, detail: message(e) });
      }
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-worker-secret": serverEnv.workerSecret() };
      const bypass = serverEnv.vercelBypassSecret();
      if (bypass) headers["x-vercel-protection-bypass"] = bypass;
      const res = await fetch(`${resolveBaseUrl(request.url)}/api/internal/worker`, {
        method: "POST",
        headers,
        body: JSON.stringify({ step: "health" }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; ffmpeg?: string; ms?: number; region?: string; error?: string } | null;
      checks.push({
        key: "worker",
        label: "Worker xử lý âm thanh (ffmpeg)",
        ok: Boolean(res.ok && body?.ok),
        detail: body?.ok
          ? `${body.ffmpeg} — ${body.ms} ms${body.region ? `, vùng ${body.region}` : ""}`
          : (body?.error ?? `HTTP ${res.status} — kiểm tra APP_URL / Deployment Protection`),
      });
    } catch (e) {
      checks.push({ key: "worker", label: "Worker xử lý âm thanh (ffmpeg)", ok: false, detail: message(e) });
    }

    for (const u of USAGES) {
      try {
        const conn = await resolveConnection(u.id, user.id);
        checks.push({
          key: `ai:${u.id}`,
          label: `AI — ${u.label}`,
          ok: Boolean(conn),
          detail: conn ? `${conn.name ?? PROVIDERS[conn.provider].label} · ${conn.model}` : "Chưa có kết nối hợp lệ — thêm ở tab Kết nối AI",
        });
      } catch (e) {
        checks.push({ key: `ai:${u.id}`, label: `AI — ${u.label}`, ok: false, detail: message(e) });
      }
    }

    return Response.json({ checks });
  } catch (err) {
    return jsonError(err);
  }
}
