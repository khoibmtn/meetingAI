import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

/** Nhận mã OAuth / magic link từ Supabase và đổi thành phiên đăng nhập. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error?.message ?? "auth")}`, url.origin));
  }

  // Giới hạn tên miền email (nếu cấu hình), ví dụ chỉ cho phép email của bệnh viện
  const domains = serverEnv.allowedEmailDomains();
  const email = data.user.email?.toLowerCase() ?? "";
  if (domains.length && !domains.some((d) => email.endsWith(`@${d}`))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/recordings";
  return next;
}
