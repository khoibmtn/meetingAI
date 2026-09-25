import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTranscriptForLLM } from "@/lib/transcription/format";
import { meetingInfoBlock } from "@/lib/reports/generate";
import type { Segment, Speaker } from "@/lib/transcription/types";
import type { ProviderKind } from "./catalog";

export const QA_SYSTEM_PROMPT = `Bạn là trợ lý phân tích nội dung các cuộc họp, giao ban, hội nghị của một bệnh viện Việt Nam (tương tự NotebookLM).

Nguyên tắc:
- Trả lời DỰA TRÊN CÁC NGUỒN (transcript) bên dưới. Mỗi ý quan trọng phải có trích dẫn mốc thời gian đúng định dạng [R1 05:23] — R1 là mã nguồn, 05:23 là mốc thời gian trong bản ghi đó. Có thể trích nhiều mốc: [R1 05:23][R2 12:10].
- Nếu nguồn không chứa thông tin, nói rõ: "Không tìm thấy nội dung này trong các bản ghi." Không bịa.
- Được bổ sung kiến thức y khoa chung để giải thích, nhưng phải ghi rõ "(kiến thức chung, không có trong cuộc họp)".
- Giữ nguyên chính xác số liệu, liều thuốc, thuật ngữ. Nêu rõ ai nói gì khi phù hợp.
- Trả lời bằng tiếng Việt, định dạng Markdown gọn gàng (gạch đầu dòng, bảng khi so sánh).`;

/** Ước lượng giới hạn ký tự ngữ cảnh theo nhà cung cấp (≈ 3 ký tự/token cho tiếng Việt). */
function charBudget(provider: ProviderKind): number {
  if (provider === "deepseek" || provider === "openai_compatible") return 280_000; // ~ 90k token
  return 1_800_000; // ~ 600k token (Gemini/Claude/OpenAI ngữ cảnh lớn)
}

export interface SourceInfo {
  code: string; // R1, R2…
  recordingId: string;
  title: string;
  meetingDate: string | null;
}

export async function buildQaContext(recordingIds: string[], provider: ProviderKind) {
  const admin = createAdminClient();
  const { data: recs } = await admin.from("recordings").select("*").in("id", recordingIds);
  const { data: transcripts } = await admin
    .from("transcripts")
    .select("recording_id, segments, speakers")
    .in("recording_id", recordingIds);
  const ordered = (recs ?? []).sort(
    (a, b) => (b.meeting_date ?? b.created_at).localeCompare(a.meeting_date ?? a.created_at),
  );
  const budget = charBudget(provider);
  let used = QA_SYSTEM_PROMPT.length;
  const blocks: string[] = [];
  const sources: SourceInfo[] = [];
  const skipped: string[] = [];
  ordered.forEach((rec) => {
    const t = transcripts?.find((x) => x.recording_id === rec.id);
    const segments = (t?.segments as unknown as Segment[]) ?? [];
    if (!segments.length) return;
    const code = `R${sources.length + 1}`;
    const speakers = (t?.speakers as unknown as Speaker[]) ?? [];
    const block = [
      `=== NGUỒN ${code}: ${rec.title} ===`,
      meetingInfoBlock(rec, speakers),
      "TRANSCRIPT:",
      formatTranscriptForLLM(segments, speakers, { prefix: `${code} ` }),
    ].join("\n");
    if (used + block.length > budget) {
      skipped.push(rec.title);
      return;
    }
    used += block.length;
    blocks.push(block);
    sources.push({ code, recordingId: rec.id, title: rec.title, meetingDate: rec.meeting_date });
  });
  const system = `${QA_SYSTEM_PROMPT}\n\nDANH SÁCH NGUỒN:\n${sources.map((s) => `- ${s.code}: ${s.title}${s.meetingDate ? ` (${s.meetingDate})` : ""}`).join("\n")}\n\n${blocks.join("\n\n")}`;
  return { system, sources, skipped };
}
