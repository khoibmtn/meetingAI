import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

let adminClient: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Supabase client quyền service role — BỎ QUA RLS.
 * Chỉ dùng trong route/worker phía server sau khi đã tự kiểm tra quyền.
 */
export function createAdminClient() {
  if (!adminClient) {
    adminClient = createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
