import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export async function getSetting<T>(key: string): Promise<T | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

export async function setSetting(key: string, value: unknown, userId?: string) {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key, value: value as Json, updated_by: userId ?? null, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Không lưu được cấu hình: ${error.message}`);
}

