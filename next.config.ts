import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path at runtime; keep it out of the bundle
  // and make sure the binary is traced into the worker function on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/internal/worker": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  poweredByHeader: false,
};

export default nextConfig;
