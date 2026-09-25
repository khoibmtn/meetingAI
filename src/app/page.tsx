import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const session = await getSessionProfile();
  redirect(session ? "/recordings" : "/login");
}
