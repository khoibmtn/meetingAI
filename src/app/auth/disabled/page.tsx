import { BanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DisabledPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <BanIcon className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Tài khoản đã bị khoá</h1>
        <p className="text-sm text-muted-foreground">Liên hệ quản trị viên để biết thêm chi tiết.</p>
        <form action="/auth/signout" method="post">
          <Button variant="outline">Đăng xuất</Button>
        </form>
      </div>
    </main>
  );
}
