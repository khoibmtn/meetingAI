"use client";

import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const items = [
    { v: "light", label: "Sáng", icon: SunIcon },
    { v: "dark", label: "Tối", icon: MoonIcon },
    { v: "system", label: "Theo hệ thống", icon: MonitorIcon },
  ];
  return (
    <>
      <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
      {items.map((i) => (
        <DropdownMenuItem key={i.v} onSelect={() => setTheme(i.v)}>
          <i.icon /> {i.label} {theme === i.v ? <span className="ml-auto text-xs text-primary">●</span> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}
