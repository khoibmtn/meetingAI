import type { NextRequest } from "next/server";
import { jsonError, requireApiAdmin } from "@/lib/auth";
import { summarizeUsage } from "@/lib/ai/usage";

/** Tổng hợp token AI (theo nhà cung cấp / mô hình / tác vụ) trong N ngày gần nhất — chỉ quản trị viên. */
export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin();
    const days = Math.min(Math.max(Math.round(Number(request.nextUrl.searchParams.get("days")) || 30), 1), 365);
    try {
      return Response.json(await summarizeUsage(days));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ai_usage/.test(msg)) {
        throw new Error("Chưa có bảng ai_usage — chạy migration supabase/migrations/20260928000000_ai_usage.sql");
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err);
  }
}
