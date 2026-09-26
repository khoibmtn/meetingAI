"use client";

import Link from "next/link";
import { CircleHelpIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfile } from "@/components/profile-context";
import { ThemeMenuItems } from "./theme-toggle";
import { cn } from "@/lib/utils";

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const profile = useProfile();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-lg text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "p-0.5" : "w-full p-2",
        )}
      >
        <UserAvatar name={profile.full_name ?? profile.email} src={profile.avatar_url} />
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{profile.full_name ?? "Người dùng"}</div>
            <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium text-foreground">{profile.full_name}</div>
          <div className="truncate text-xs">{profile.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon /> Cài đặt cá nhân
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help">
            <CircleHelpIcon /> Hướng dẫn sử dụng
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOutIcon /> Đăng xuất
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
