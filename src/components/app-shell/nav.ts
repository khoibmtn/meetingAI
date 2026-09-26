import {
  AudioLinesIcon,
  BookTextIcon,
  CircleHelpIcon,
  FileTextIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: "chat";
}

export const NAV_MAIN: NavItem[] = [
  { href: "/recordings", label: "Bản ghi", icon: AudioLinesIcon },
  { href: "/groups", label: "Nhóm", icon: UsersIcon },
  { href: "/chat", label: "Trò chuyện", icon: MessagesSquareIcon, badge: "chat" },
  { href: "/notes", label: "Ghi chú", icon: NotebookPenIcon },
];

export const NAV_TOOLS: NavItem[] = [
  { href: "/templates", label: "Template tổng hợp", icon: FileTextIcon },
  { href: "/glossary", label: "Từ điển thuật ngữ", icon: BookTextIcon },
  { href: "/settings", label: "Cài đặt", icon: SettingsIcon },
  { href: "/help", label: "Hướng dẫn", icon: CircleHelpIcon },
  { href: "/admin", label: "Quản trị", icon: ShieldCheckIcon, adminOnly: true },
];
