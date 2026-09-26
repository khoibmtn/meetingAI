import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionProfile } from "@/lib/auth";
import { isDatabaseReady, supabaseProjectRef } from "@/lib/setup-status";
import { CopyMigrationButton } from "./copy-migration-button";

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
  {
    key: ["GOOGLE_CLIENT_ID"],
    label: "Google OAuth Client ID",
    required: false,
    hint: "Cần để lưu tệp ghi âm lên Google Drive — có thể thêm sau (Google Cloud Console → Credentials)",
  },
  {
    key: ["GOOGLE_CLIENT_SECRET"],
    label: "Google OAuth Client Secret",
    required: false,
    hint: "Đi cùng Client ID ở trên",
  },
  { key: ["WORKER_SECRET"], label: "Bí mật worker nền", required: false, hint: "Mặc định dùng APP_ENCRYPTION_KEY" },
  { key: ["APP_URL"], label: "URL ứng dụng", required: false, hint: "vd https://meetingai.vercel.app" },
  { key: ["CRON_SECRET"], label: "Bí mật Vercel Cron", required: false, hint: "Cho tác vụ tự khôi phục" },
];

export default async function SetupPage() {
  const configured = isSupabaseConfigured();
  const dbReady = configured ? await isDatabaseReady() : false;
  // Khi đã cấu hình xong, chỉ quản trị viên được xem danh sách biến môi trường.
  if (configured && dbReady) {
    const session = await getSessionProfile().catch(() => null);
    if (session?.profile?.role !== "admin") redirect("/");
  }
  const present = (keys: string[]) => keys.some((k) => Boolean(process.env[k]));
  const ref = supabaseProjectRef();
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

      {configured && !dbReady ? (
        <section className="space-y-3 rounded-xl border border-warning/50 bg-warning/10 p-4">
          <h2 className="font-semibold">Còn một bước: khởi tạo cơ sở dữ liệu</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Bấm nút dưới đây để sao chép toàn bộ SQL khởi tạo.</li>
            <li>
              Mở{" "}
              {ref ? (
                <a
                  href={`https://supabase.com/dashboard/project/${ref}/sql/new`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Supabase → SQL Editor
                </a>
              ) : (
                "Supabase → SQL Editor"
              )}
              , dán vào và bấm <b>Run</b>.
            </li>
            <li>Tải lại trang này. Người đăng ký đầu tiên sẽ là quản trị viên.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <CopyMigrationButton />
            <a href="/setup/migration" target="_blank" className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent">
              Xem SQL
            </a>
          </div>
        </section>
      ) : null}

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
        {configured ? (
          <li className="flex items-start gap-3 p-4">
            {dbReady ? (
              <CheckCircle2Icon className="mt-0.5 size-5 text-success" />
            ) : (
              <CircleAlertIcon className="mt-0.5 size-5 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">Cơ sở dữ liệu đã khởi tạo</div>
              <div className="text-xs text-muted-foreground">Chạy SQL trong supabase/migrations một lần trên Supabase</div>
            </div>
          </li>
        ) : null}
      </ul>
      <p className="text-sm text-muted-foreground">
        Google OAuth Client chỉ cần cho lưu trữ Google Drive — có thể thêm sau. Người đăng ký đầu tiên sẽ là quản trị viên.
      </p>
    </main>
  );
}
