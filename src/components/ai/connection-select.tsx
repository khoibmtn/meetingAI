"use client";

import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS, usageRejectReason, type Usage } from "@/lib/ai/catalog";
import { cn } from "@/lib/utils";
import { validConnectionsFor, type ConnectionsState } from "./use-connections";

/** Chọn một kết nối AI hợp lệ (đã kiểm tra thành công) cho vị trí sử dụng. */
export function ConnectionSelect({
  state,
  usage,
  value,
  onChange,
  className,
  size = "default",
}: {
  state: ConnectionsState | null;
  usage: Usage;
  value?: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "default";
}) {
  const options = validConnectionsFor(state, usage);
  const unusable = (state?.connections ?? []).filter((c) => !options.includes(c));
  if (state && options.length === 0) {
    return (
      <div className={cn("rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground", className)}>
        Chưa có kết nối AI hợp lệ.{" "}
        <Link href="/settings#ai" className="font-medium text-primary hover:underline">
          Thêm kết nối
        </Link>
      </div>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size={size} className={cn("w-full min-w-0", className)}>
        <SelectValue placeholder="Chọn mô hình AI" />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="min-w-0 truncate">
              {c.name}
              <span className="ml-1 text-xs text-muted-foreground">
                · {PROVIDERS[c.provider].label.split(" ")[0]} · {c.model}
              </span>
            </span>
          </SelectItem>
        ))}
        {unusable.map((c) => (
          <SelectItem key={c.id} value={c.id} disabled>
            <span className="min-w-0 truncate">
              {c.name}{" "}
              <span className="text-xs">— {usageRejectReason(usage, c.provider) ?? "chưa kiểm tra kết nối thành công"}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
