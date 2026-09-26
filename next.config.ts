import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path at runtime; keep it out of the bundle
  // and make sure the binary is traced into the worker function on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/internal/worker": ["./node_modules/ffmpeg-static/ffmpeg"],
    // SQL migration hiển thị ở trang cài đặt ban đầu
    "/setup/migration": ["./supabase/migrations/*.sql"],
  },
  poweredByHeader: false,
};

export default nextConfig;
