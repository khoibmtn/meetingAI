import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

const ERRORS: Record<string, string> = {
  domain: "Email này không thuộc tên miền được phép đăng nhập.",
  missing_code: "Thiếu mã xác thực — vui lòng thử lại.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getSessionProfile();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/recordings";
  if (session) redirect(next);
  const errorKey = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2 text-lg font-semibold">MeetingAI</div>
        <div className="max-w-lg space-y-6">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Ghi âm giao ban, họp, hội nghị — nhận transcript phân vai và biên bản trong vài phút.
          </h1>
          <ul className="space-y-3 text-primary-foreground/85">
            <li>• Phiên âm tiếng Việt, giữ đúng thuật ngữ y khoa, tên thuốc, số liệu.</li>
            <li>• Nhận diện người nói, gắn tên theo nội dung cuộc họp.</li>
            <li>• Tổng hợp theo mẫu: giao ban chuyên môn, biên bản NĐ 30/2020, hội nghị.</li>
            <li>• Chia sẻ theo nhóm, hỏi đáp AI trên nội dung, chat nhóm & 1-1.</li>
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/70">Tệp ghi âm gốc được lưu nguyên vẹn trên Google Drive của đơn vị.</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Logo />
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Đăng nhập</h2>
            <p className="text-sm text-muted-foreground">Dùng tài khoản Google hoặc email của bạn.</p>
          </div>
          {errorKey ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ERRORS[errorKey] ?? decodeURIComponent(errorKey)}
            </div>
          ) : null}
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
