"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Thuộc tính để trình duyệt và trình quản lý mật khẩu (Chrome, 1Password, LastPass, Bitwarden, Dashlane)
 * KHÔNG coi ô là tên đăng nhập / mật khẩu: không gợi ý, không tự điền, không đề nghị lưu.
 */
export const NO_AUTOFILL = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

const noSubscribe = () => () => {};
const supportsCssMask = () => typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc");

/**
 * Ô nhập khoá API / bí mật: che ký tự nhưng KHÔNG phải ô mật khẩu (type="password" khiến trình duyệt ghép
 * ô trước đó thành "tên đăng nhập" và gợi ý mật khẩu đã lưu). Che bằng CSS -webkit-text-security; trình duyệt
 * không hỗ trợ thì mới dùng ô mật khẩu kèm autocomplete="new-password" (không tự điền mật khẩu đã lưu).
 */
export function SecretInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = React.useState(false);
  const cssMask = React.useSyncExternalStore(noSubscribe, supportsCssMask, () => true);
  const fallbackPassword = !show && !cssMask;
  return (
    <div className="flex gap-2">
      <Input
        {...NO_AUTOFILL}
        {...props}
        type={fallbackPassword ? "password" : "text"}
        autoComplete={fallbackPassword ? "new-password" : "off"}
        className={cn(
          "font-mono",
          !show && cssMask && "[-webkit-text-security:disc] placeholder:[-webkit-text-security:none]",
          className,
        )}
      />
      <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)} aria-label={show ? "Ẩn khoá" : "Hiện khoá"}>
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}
