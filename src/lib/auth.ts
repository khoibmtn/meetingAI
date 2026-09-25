import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { isDatabaseReady } from "@/lib/setup-status";

export type Profile = Tables<"profiles">;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Người dùng hiện tại + hồ sơ (cache theo request). Null nếu chưa đăng nhập. */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return profile ? { user, profile } : null;
});

/** Dùng trong Server Component/page: bắt buộc đăng nhập và tài khoản đang hoạt động. */
export async function requirePageUser() {
  const session = await getSessionProfile();
  // Không có hồ sơ: chưa đăng nhập, hoặc CSDL chưa chạy migration (bảng profiles chưa có)
  if (!session) redirect((await isDatabaseReady()) ? "/login" : "/setup");
  if (session.profile.status === "pending") redirect("/auth/pending");
  if (session.profile.status === "disabled") redirect("/auth/disabled");
  return session;
}

/** Dùng trong Route Handler: ném HttpError 401/403. */
export async function requireApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Chưa đăng nhập");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") throw new HttpError(403, "Tài khoản chưa được kích hoạt");
  return { supabase, user, profile };
}

export async function requireApiAdmin() {
  const ctx = await requireApiUser();
  if (ctx.profile.role !== "admin") throw new HttpError(403, "Chỉ quản trị viên được thực hiện thao tác này");
  return ctx;
}

/** Bọc route handler: chuyển lỗi thành JSON thống nhất. */
export function jsonError(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Lỗi không xác định";
  return Response.json({ error: message }, { status: 500 });
}
