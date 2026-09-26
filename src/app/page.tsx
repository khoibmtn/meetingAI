import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { isDatabaseReady } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured() || !(await isDatabaseReady())) redirect("/setup");
  const session = await getSessionProfile();
  redirect(session ? "/recordings" : "/login");
}
