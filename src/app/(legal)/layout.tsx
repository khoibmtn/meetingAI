import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Trang công khai (không cần đăng nhập): chính sách quyền riêng tư, điều khoản sử dụng. */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="MeetingAI — trang chủ">
            <Logo />
          </Link>
          <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Đăng nhập
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t">
        <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Link href="/privacy" className="hover:text-foreground">
            Chính sách quyền riêng tư
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Điều khoản sử dụng
          </Link>
        </nav>
      </footer>
    </div>
  );
}
