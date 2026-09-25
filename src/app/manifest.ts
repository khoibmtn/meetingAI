import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeetingAI — Phiên âm & tổng hợp cuộc họp",
    short_name: "MeetingAI",
    description: "Phiên âm tiếng Việt có phân vai, tổng hợp giao ban/họp/hội nghị bằng AI, chia sẻ theo nhóm.",
    start_url: "/recordings",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1b6f9a",
    lang: "vi",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
