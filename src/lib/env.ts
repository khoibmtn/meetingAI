/**
 * Truy cập biến môi trường tập trung, có thông báo lỗi tiếng Việt dễ hiểu.
 * Chỉ các biến NEXT_PUBLIC_* được dùng ở client.
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function requireEnv(name: string, hint?: string): string {
  const v = read(name);
  if (!v) {
    throw new Error(`Thiếu biến môi trường ${name}${hint ? ` — ${hint}` : ""}`);
  }
  return v;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Hỗ trợ cả khoá mới (publishable) lẫn khoá cũ (anon)
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);
}

export const serverEnv = {
  supabaseSecretKey: () =>
    read("SUPABASE_SECRET_KEY") ??
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", "cần khoá secret/service_role của Supabase"),
  encryptionKey: () =>
    requireEnv("APP_ENCRYPTION_KEY", "chuỗi base64 32 byte, tạo bằng: openssl rand -base64 32"),
  workerSecret: () =>
    read("WORKER_SECRET") ?? requireEnv("APP_ENCRYPTION_KEY", "cần WORKER_SECRET hoặc APP_ENCRYPTION_KEY"),
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
  driveRefreshToken: () => read("GOOGLE_DRIVE_REFRESH_TOKEN"),
  driveFolderId: () => read("GOOGLE_DRIVE_FOLDER_ID"),
  appUrl: () => read("APP_URL"),
  vercelBypassSecret: () => read("VERCEL_AUTOMATION_BYPASS_SECRET"),
  allowedEmailDomains: () =>
    (read("ALLOWED_EMAIL_DOMAINS") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  envApiKey: (provider: string) => {
    switch (provider) {
      case "gemini":
        return read("GEMINI_API_KEY") ?? read("GOOGLE_API_KEY");
      case "openai":
        return read("OPENAI_API_KEY");
      case "anthropic":
        return read("ANTHROPIC_API_KEY");
      case "soniox":
        return read("SONIOX_API_KEY");
      default:
        return undefined;
    }
  },
};
