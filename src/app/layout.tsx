import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "vietnamese"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "MeetingAI", template: "%s · MeetingAI" },
  description: "Phiên âm tiếng Việt có phân vai người nói, tổng hợp giao ban, cuộc họp, hội nghị bằng AI.",
  applicationName: "MeetingAI",
  appleWebApp: { capable: true, title: "MeetingAI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#12151c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
