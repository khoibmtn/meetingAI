import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireConnection } from "@/lib/ai/connections";
import { cleanupMarkdown, resolveTemplate, streamReport } from "@/lib/reports/generate";
import { textStreamResponse } from "@/lib/http/stream";

export const maxDuration = 300;

/** Sinh báo cáo theo template (stream về trình duyệt, đồng thời lưu vào CSDL). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireApiUser();
    const { data: canView } = await supabase.rpc("can_view_recording", { rid: id });
    if (!canView) throw new HttpError(403, "Không có quyền với bản ghi này");
    const body = (await request.json()) as { templateKey: string; connectionId?: string; isShared?: boolean; title?: string };
    const template = await resolveTemplate(body.templateKey, user.id);
    const conn = await requireConnection("report", user.id, body.connectionId);

    const admin = createAdminClient();
    const { data: report, error } = await admin
      .from("reports")
      .insert({
        recording_id: id,
        template_key: template.key,
        title: body.title?.trim() || template.name,
        status: "generating",
        provider: conn.provider,
        model: conn.model,
        is_shared: body.isShared ?? true,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !report) throw new Error(error?.message ?? "Không tạo được báo cáo");

    // Mô hình thực sự trả lời (mô hình dự phòng nếu mô hình chính quá tải) — ghi đúng vào báo cáo
    let servedModel = conn.model;
    const stream = streamReport(id, template, conn, { onModel: (m) => (servedModel = m) });
    return textStreamResponse(stream, {
      headers: { "x-report-id": report.id },
      onDone: async (text) => {
        await admin
          .from("reports")
          .update({ content: cleanupMarkdown(text), status: "ready", model: servedModel })
          .eq("id", report.id);
      },
      onError: async (err, partial) => {
        await admin
          .from("reports")
          .update({
            content: `${partial}\n\n> ⚠️ Lỗi khi tạo báo cáo: ${err instanceof Error ? err.message : String(err)}`,
            status: "error",
          })
          .eq("id", report.id);
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
