"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon, MicIcon, PlusIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProfileProvider, type CurrentProfile } from "@/components/profile-context";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_TOOLS, type NavItem } from "./nav";
import { UserMenu } from "./user-menu";
import { useUnreadCount } from "./use-unread";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, unread, onNavigate }: { item: NavItem; pathname: string; unread: number; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-[18px]", active && "text-primary")} />
      <span className="flex-1">{item.label}</span>
      {item.badge === "chat" && unread > 0 ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarNav({ profile, pathname, unread, onNavigate }: { profile: CurrentProfile; pathname: string; unread: number; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
      <div className="space-y-1">
        {NAV_MAIN.map((i) => (
          <NavLink key={i.href} item={i} pathname={pathname} unread={unread} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="space-y-1">
        <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Công cụ</div>
        {NAV_TOOLS.filter((i) => !i.adminOnly || profile.role === "admin").map((i) => (
          <NavLink key={i.href} item={i} pathname={pathname} unread={unread} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

export function AppShell({ profile, children }: { profile: CurrentProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const unread = useUnreadCount(profile.id);
  const [open, setOpen] = useState(false);

  return (
    <ProfileProvider profile={profile}>
      <div className="flex min-h-dvh">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
          <div className="flex h-16 items-center px-5">
            <Link href="/recordings">
              <Logo />
            </Link>
          </div>
          <div className="px-3 pb-3">
            <Button asChild className="w-full justify-start">
              <Link href="/recordings/new">
                <PlusIcon /> Bản ghi mới
              </Link>
            </Button>
          </div>
          <SidebarNav profile={profile} pathname={pathname} unread={unread} />
          <div className="border-t p-3">
            <UserMenu />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Thanh trên di động */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mở menu">
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col gap-0 bg-sidebar p-0">
                <SheetTitle className="sr-only">Điều hướng</SheetTitle>
                <div className="flex h-16 items-center px-5">
                  <Logo />
                </div>
                <SidebarNav profile={profile} pathname={pathname} unread={unread} onNavigate={() => setOpen(false)} />
                <div className="border-t p-3">
                  <UserMenu />
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/recordings" className="flex items-center gap-2 font-semibold">
              <LogoMark className="size-7" /> MeetingAI
            </Link>
            <div className="ml-auto">
              <UserMenu compact />
            </div>
          </header>

          <main className="flex-1 pb-20 lg:pb-0">{children}</main>

          {/* Thanh điều hướng dưới trên di động */}
          <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur lg:hidden">
            <div className="grid grid-cols-5 items-end">
              {NAV_MAIN.slice(0, 2).map((i) => (
                <MobileTab key={i.href} item={i} pathname={pathname} unread={unread} />
              ))}
              <div className="flex justify-center">
                <Link
                  href="/recordings/new?mode=record"
                  aria-label="Ghi âm mới"
                  className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                >
                  <MicIcon className="size-6" />
                </Link>
              </div>
              {NAV_MAIN.slice(2, 4).map((i) => (
                <MobileTab key={i.href} item={i} pathname={pathname} unread={unread} />
              ))}
            </div>
          </nav>
        </div>
      </div>
    </ProfileProvider>
  );
}

function MobileTab({ item, pathname, unread }: { item: NavItem; pathname: string; unread: number }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <item.icon className="size-5" />
      {item.label}
      {item.badge === "chat" && unread > 0 ? (
        <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-destructive px-1 text-[9px] leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
