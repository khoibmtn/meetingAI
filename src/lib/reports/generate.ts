import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/database.types";
import { streamText, type ConnectionConfig } from "@/lib/ai";
import { markAuthFailure, requireConnection } from "@/lib/ai/connections";
import { getSetting } from "@/lib/settings";
import { formatTranscriptForLLM, speakerDisplay } from "@/lib/transcription/format";
import { loadGlossaryForRecording } from "@/lib/transcription/glossary";
import { CATEGORY_LABELS, formatGlossary } from "@/lib/transcription/prompts";
import { hasIdentifiedName } from "@/lib/transcription/speakers";
import { formatDuration } from "@/lib/transcription/timecode";
import type { Segment, Speaker } from "@/lib/transcription/types";
import { findSystemTemplate, REPORT_SYSTEM_PROMPT, type ReportTemplate } from "./templates";

export interface OrganizationInfo {
  parentOrg?: string; // Cơ quan chủ quản, vd "SỞ Y TẾ HẢI PHÒNG"
  orgName?: string; // vd "TRUNG TÂM Y TẾ THỦY NGUYÊN"
  orgShort?: string; // chữ viết tắt, vd "TTYT"
  place?: string; // địa danh
  contactEmail?: string; // email liên hệ, hiển thị ở trang Chính sách quyền riêng tư / Điều khoản
}

type Recording = Tables<"recordings">;

export async function getOrganizationInfo(): Promise<OrganizationInfo> {
  return (await getSetting<OrganizationInfo>("organization")) ?? {};
}

/** Tìm template (hệ thống hoặc tuỳ chỉnh) mà người dùng được phép dùng. */
export async function resolveTemplate(key: string, userId: string): Promise<ReportTemplate> {
  const sys = findSystemTemplate(key);
  if (sys) return sys;
  const admin = createAdminClient();
  const { data: t } = await admin.from("templates").select("*").eq("id", key).maybeSingle();
  if (!t) throw new Error("Không tìm thấy template");
  let allowed = t.scope === "org" || (t.scope === "user" && t.owner_id === userId);
  if (!allowed && t.scope === "group" && t.group_id) {
    const { data: m } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", t.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    allowed = Boolean(m);
  }
  if (!allowed) throw new Error("Không có quyền dùng template này");
  return { key: t.id, name: t.name, description: t.description ?? "", categories: [t.category], prompt: t.prompt };
}

export function meetingInfoBlock(recording: Recording, speakers: Speaker[]): string {
  const named = speakers.filter((s) => hasIdentifiedName(s));
  const unnamed = speakers.filter((s) => !hasIdentifiedName(s));
  return [
    `Tên cuộc họp: ${recording.title}`,
    `Loại: ${CATEGORY_LABELS[recording.category] ?? recording.category}`,
    recording.meeting_date ? `Ngày họp: ${recording.meeting_date}` : null,
    recording.location ? `Địa điểm: ${recording.location}` : null,
    recording.duration_sec ? `Thời lượng: ${formatDuration(Number(recording.duration_sec))}` : null,
    recording.participants ? `Thành phần dự kiến: ${recording.participants}` : null,
    named.length ? `Người nói đã xác định tên: ${named.map((s) => speakerDisplay(s.key, speakers)).join("; ")}` : null,
    unnamed.length
      ? `Người nói chưa rõ tên (nhãn phân vai tự động, không phải người tham dự cụ thể): ${unnamed
          .map((s) => speakerDisplay(s.key, speakers, false))
          .join(", ")}`
      : null,
    recording.description ? `Ghi chú: ${recording.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function fillOrgPlaceholders(prompt: string, org: OrganizationInfo): string {
  return prompt
    .replaceAll("{{ORG_PARENT}}", org.parentOrg?.toUpperCase() || "…")
    .replaceAll("{{ORG_NAME}}", org.orgName?.toUpperCase() || "…")
    .replaceAll("{{ORG_SHORT}}", org.orgShort || "…")
    .replaceAll("{{PLACE}}", org.place || "…");
}

export async function buildReportRequest(recordingId: string, template: ReportTemplate) {
  const admin = createAdminClient();
  const { data: recording } = await admin.from("recordings").select("*").eq("id", recordingId).single();
  if (!recording) throw new Error("Không tìm thấy bản ghi");
  const { data: transcript } = await admin.from("transcripts").select("*").eq("recording_id", recordingId).maybeSingle();
  const segments = (transcript?.segments as unknown as Segment[]) ?? [];
  if (!segments.length) throw new Error("Bản ghi chưa có transcript");
  const speakers = (transcript?.speakers as unknown as Speaker[]) ?? [];
  const [org, glossary] = await Promise.all([
    getOrganizationInfo(),
    loadGlossaryForRecording(recordingId, [recording.owner_id]),
  ]);

  // Phần ổn định (hướng dẫn + thông tin + transcript) đặt trong system để tận dụng prompt caching
  const system = [
    REPORT_SYSTEM_PROMPT,
    "",
    "THÔNG TIN ĐƠN VỊ:",
    `Cơ quan chủ quản: ${org.parentOrg || "…"}; Đơn vị: ${org.orgName || "…"}; Viết tắt: ${org.orgShort || "…"}`,
    "",
    "THÔNG TIN CUỘC HỌP:",
    meetingInfoBlock(recording, speakers),
    "",
    "TỪ ĐIỂN THUẬT NGỮ / TÊN RIÊNG — chính tả chuẩn để sửa từ bị nhận dạng sai; không dùng để thêm nội dung:",
    formatGlossary(glossary, 200),
    "",
    "TRANSCRIPT ([mm:ss] Người nói: lời nói):",
    formatTranscriptForLLM(segments, speakers),
  ].join("\n");
  const user = `YÊU CẦU TEMPLATE "${template.name}":\n\n${fillOrgPlaceholders(template.prompt, org)}`;
  return { recording, system, user, minOutputTokens: template.minOutputTokens ?? 8000 };
}

/**
 * Sinh báo cáo dạng stream (dùng cho giao diện). `onModel` báo mô hình thực sự trả lời
 * (mô hình dự phòng khi mô hình chính quá tải) để ghi đúng vào báo cáo.
 */
export async function* streamReport(
  recordingId: string,
  template: ReportTemplate,
  conn: ConnectionConfig,
  opts: { signal?: AbortSignal; onModel?: (model: string) => void; userId?: string } = {},
): AsyncGenerator<string> {
  const { system, user, minOutputTokens } = await buildReportRequest(recordingId, template);
  try {
    yield* streamText({
      conn,
      // system giống hệt giữa các template của cùng bản ghi → văn bản thứ hai trở đi trúng cache phần transcript
      system,
      messages: [{ role: "user", content: user }],
      minOutputTokens,
      signal: opts.signal,
      onModel: opts.onModel,
      cacheKey: `rec-${recordingId}`,
      usage: { task: "report", userId: opts.userId ?? null, recordingId },
    });
  } catch (err) {
    await markAuthFailure(conn, err);
    throw err;
  }
}

/** Sinh báo cáo và lưu thẳng vào CSDL (dùng trong worker tự động). */
export async function generateReportToDb(params: {
  recordingId: string;
  templateKey: string;
  userId: string;
  connectionId?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const template = await resolveTemplate(params.templateKey, params.userId);
  const conn = await requireConnection("report", params.userId, params.connectionId);
  const { data: report, error } = await admin
    .from("reports")
    .insert({
      recording_id: params.recordingId,
      template_key: template.key,
      title: template.name,
      status: "generating",
      provider: conn.provider,
      model: conn.model,
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !report) throw new Error(error?.message ?? "Không tạo được báo cáo");
  let content = "";
  let lastSave = Date.now();
  let servedModel = conn.model;
  try {
    for await (const piece of streamReport(params.recordingId, template, conn, {
      onModel: (m) => (servedModel = m),
      userId: params.userId,
    })) {
      content += piece;
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        await admin.from("reports").update({ content }).eq("id", report.id);
      }
    }
    await admin
      .from("reports")
      .update({ content: cleanupMarkdown(content), status: "ready", model: servedModel })
      .eq("id", report.id);
  } catch (err) {
    await admin
      .from("reports")
      .update({
        content: content + `\n\n> ⚠️ Lỗi khi tạo báo cáo: ${err instanceof Error ? err.message : String(err)}`,
        status: "error",
      })
      .eq("id", report.id);
    throw err;
  }
  return report.id;
}

/** Bỏ khối ```markdown bao ngoài nếu mô hình lỡ thêm. */
export function cleanupMarkdown(s: string): string {
  const m = s.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : s).trim();
}
