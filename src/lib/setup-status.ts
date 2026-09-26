import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/**
 * CSDL đã chạy migration chưa? Hỏi bảng app_settings bằng khoá publishable (không cần khoá secret):
 * bảng chưa tồn tại → PostgREST báo PGRST205 / Postgres 42P01. Lỗi khác (mạng…) coi như đã sẵn sàng
 * để không chặn nhầm người dùng.
 */
export const isDatabaseReady = cache(async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  try {
    const client = createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.from("app_settings").select("key").limit(1);
    if (!error) return true;
    return !(error.code === "PGRST205" || error.code === "42P01");
  } catch {
    return true;
  }
});

/** Mã project Supabase (https://abcd.supabase.co → abcd) để dẫn thẳng tới SQL Editor. */
export function supabaseProjectRef(): string | null {
  try {
    const host = new URL(publicEnv.supabaseUrl).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}
