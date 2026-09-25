import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isDatabaseReady } from "@/lib/setup-status";

/**
 * Nội dung SQL migration để dán vào Supabase SQL Editor khi khởi tạo lần đầu.
 * Chỉ phục vụ khi CSDL CHƯA khởi tạo; sau đó trả 404.
 */
export async function GET() {
  if (await isDatabaseReady()) return new Response("Không tìm thấy", { status: 404 });
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const parts = await Promise.all(files.map(async (f) => `-- ${f}\n${await readFile(path.join(dir, f), "utf8")}`));
  return new Response(parts.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
