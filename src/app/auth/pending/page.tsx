import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning/20">
          <ClockIcon className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Tài khoản đang chờ phê duyệt</h1>
        <p className="text-sm text-muted-foreground">
          Quản trị viên cần kích hoạt tài khoản của bạn trước khi sử dụng. Vui lòng liên hệ quản trị viên của đơn vị.
        </p>
        <form action="/auth/signout" method="post">
          <Button variant="outline">Đăng xuất</Button>
        </form>
      </div>
    </main>
  );
}
