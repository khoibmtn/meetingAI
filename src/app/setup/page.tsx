import type { Metadata } from "next";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Cài đặt ban đầu" };
export const dynamic = "force-dynamic";

const CHECKS: { key: string[]; label: string; required: boolean; hint: string }[] = [
  { key: ["NEXT_PUBLIC_SUPABASE_URL"], label: "Supabase URL", required: true, hint: "Project Settings → API" },
  {
    key: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    label: "Supabase publishable (anon) key",
    required: true,
    hint: "Project Settings → API Keys",
  },
  { key: ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"], label: "Supabase secret (service role) key", required: true, hint: "Chỉ đặt ở server" },
  { key: ["APP_ENCRYPTION_KEY"], label: "Khoá mã hoá ứng dụng", required: true, hint: "openssl rand -base64 32" },
  { key: ["GOOGLE_CLIENT_ID"], label: "Google OAuth Client ID (Drive)", required: true, hint: "Google Cloud Console → Credentials" },
  { key: ["GOOGLE_CLIENT_SECRET"], label: "Google OAuth Client Secret", required: true, hint: "Google Cloud Console → Credentials" },
  { key: ["WORKER_SECRET"], label: "Bí mật worker nền", required: false, hint: "Mặc định dùng APP_ENCRYPTION_KEY" },
  { key: ["APP_URL"], label: "URL ứng dụng", required: false, hint: "vd https://meetingai.vercel.app" },
  { key: ["CRON_SECRET"], label: "Bí mật Vercel Cron", required: false, hint: "Cho tác vụ tự khôi phục" },
];

export default function SetupPage() {
  const present = (keys: string[]) => keys.some((k) => Boolean(process.env[k]));
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 py-12">
      <Logo />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Cài đặt ban đầu</h1>
        <p className="text-sm text-muted-foreground">
          Đặt các biến môi trường dưới đây trong Vercel (Project → Settings → Environment Variables) rồi deploy lại.
          Xem hướng dẫn chi tiết trong README.
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {CHECKS.map((c) => {
          const ok = present(c.key);
          return (
            <li key={c.key[0]} className="flex items-start gap-3 p-4">
              {ok ? (
                <CheckCircle2Icon className="mt-0.5 size-5 text-success" />
              ) : (
                <CircleAlertIcon className={`mt-0.5 size-5 ${c.required ? "text-destructive" : "text-muted-foreground"}`} />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.label} {!c.required && <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>}
                </div>
                <code className="text-xs text-muted-foreground">{c.key.join(" hoặc ")}</code>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        Sau khi cấu hình Supabase, chạy migration trong thư mục <code>supabase/migrations</code> và bật đăng nhập Google trong
        Supabase Auth. Người đăng nhập đầu tiên sẽ là quản trị viên.
      </p>
    </main>
  );
}
