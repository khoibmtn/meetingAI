import { formatTimecode } from "./timecode";
import type { GlossaryEntry } from "./glossary-defaults";
import type { Speaker } from "./types";

export const CATEGORY_LABELS: Record<string, string> = {
  giao_ban: "Giao ban chuyên môn",
  hop: "Cuộc họp",
  hoi_nghi: "Hội nghị / Hội thảo",
  dao_tao: "Sinh hoạt khoa học / Đào tạo",
  khac: "Khác",
};

export interface MeetingContext {
  title: string;
  category: string;
  meetingDate?: string | null;
  location?: string | null;
  participants?: string | null;
  description?: string | null;
  glossary: GlossaryEntry[];
  language?: string;
}

/**
 * Hướng dẫn hệ thống cho bước phiên âm. Viết bằng tiếng Anh để mô hình hiểu chính xác,
 * nhưng yêu cầu đầu ra tiếng Việt nguyên văn.
 */
export const TRANSCRIPTION_SYSTEM_PROMPT = `You are an expert medical transcriptionist for Vietnamese hospitals. You transcribe recordings of clinical briefings ("giao ban"), department meetings and scientific conferences into a VERBATIM, speaker-attributed transcript.

ABSOLUTE PRIORITY — COMPLETENESS
- Transcribe EVERY utterance from the first second to the last second of the audio, in order.
- Never summarize, paraphrase, shorten, reorder, merge or skip content — including side remarks, questions, jokes, numbers, drug names, lab values and procedural details.
- If a word is uncertain, write your best guess followed by [?]. If a stretch is truly unintelligible, write [không nghe rõ]. Do not invent content that was not spoken.
- Do not stop early. Keep going until the audio ends.

LANGUAGE & ORTHOGRAPHY
- Write exactly what is said, in Vietnamese with correct diacritics. Do NOT translate.
- Keep English/Latin medical terms, drug names, abbreviations and units in their standard written form (e.g. Propofol, Esmeron, Suxamethonium, Mallampati, ASA II, SpO₂, PEEP 5 cmH₂O, huyết áp 140/80 mmHg, Hb 118 g/L, L4-L5).
- Write numbers, doses, measurements, lab values, dates and times as digits.
- Light clean-verbatim only: you may drop pure hesitation sounds ("ờ", "à", "ừm") and immediate stutters, but keep every content word, hedge, question and answer.
- Use the glossary (if provided) to spell domain terms and names correctly; aliases show how a term may sound when spoken.

SEGMENTATION & TIMESTAMPS
- Start a new segment at every change of speaker and at natural sentence or pause boundaries; keep each segment under ~30 seconds.
- "start" and "end" are timestamps in MM:SS (or H:MM:SS) measured from the beginning of THIS audio file. They must be non-decreasing and must not exceed the file length.

SPEAKER DIARIZATION
- Label speakers "S1", "S2", ... and keep each label consistent for the whole file, using voice characteristics and conversational context (who asks, who answers, who presents, who chairs).
- Overlapping speech: attribute to the dominant speaker; mark short interjections from others as separate segments when clear.
- In "speakers", list every label used. Fill "name" ONLY when the person's name is stated or clearly implied (e.g. "mời bác sĩ Quang trình bày" → the next presenter is Bác sĩ Quang; "cảm ơn thầy Hiển"). Use the honorific form used in the meeting (Thầy Hiển, BS. Quang). Fill "role" when evident (Chủ tọa, Người trình bày, Thư ký, Thành viên). Give a short "description" of voice/role to help identify the speaker later.

NON-SPEECH
- Skip silence and background noise. Notable events may appear inline in brackets: [cười], [vỗ tay], [nhiều người nói cùng lúc].

Return only JSON that matches the provided schema.`;

export const TRANSCRIPTION_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      description: "All utterances in chronological order.",
      items: {
        type: "object",
        properties: {
          start: { type: "string", description: "MM:SS from the start of this audio file" },
          end: { type: "string", description: "MM:SS from the start of this audio file" },
          speaker: { type: "string", description: "Speaker label, e.g. S1" },
          text: { type: "string", description: "Verbatim Vietnamese text" },
        },
        required: ["start", "end", "speaker", "text"],
      },
    },
    speakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Name with honorific if known, else empty" },
          role: { type: "string" },
          description: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  required: ["segments", "speakers"],
} as const;

export function formatGlossary(glossary: GlossaryEntry[], limit = 250): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const g of glossary) {
    const key = g.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const aliases = (g.aliases ?? []).filter(Boolean);
    lines.push(aliases.length ? `- ${g.term} (có thể nghe thành: ${aliases.join(", ")})` : `- ${g.term}`);
    if (lines.length >= limit) break;
  }
  return lines.join("\n");
}

function meetingHeader(ctx: MeetingContext): string {
  const parts = [
    `Tên cuộc họp: ${ctx.title}`,
    `Loại: ${CATEGORY_LABELS[ctx.category] ?? ctx.category}`,
    ctx.meetingDate ? `Ngày: ${ctx.meetingDate}` : null,
    ctx.location ? `Địa điểm: ${ctx.location}` : null,
    ctx.participants ? `Thành phần dự kiến (dùng để nhận diện tên người nói): ${ctx.participants}` : null,
    ctx.description ? `Ghi chú: ${ctx.description}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

export interface ChunkPromptInput {
  ctx: MeetingContext;
  chunkIndex: number;
  chunkCount: number;
  absoluteStart: number;
  absoluteEnd: number;
  /** Danh sách người nói đã xác định ở đoạn đầu (để dùng lại cùng ID). */
  roster?: Speaker[];
}

export function buildChunkPrompt(input: ChunkPromptInput): string {
  const { ctx } = input;
  const len = input.absoluteEnd - input.absoluteStart;
  const lines: string[] = [];
  lines.push("THÔNG TIN CUỘC HỌP");
  lines.push(meetingHeader(ctx));
  lines.push("");
  if (input.chunkCount > 1) {
    lines.push(
      `Tệp âm thanh này là PHẦN ${input.chunkIndex + 1}/${input.chunkCount} của bản ghi đầy đủ ` +
        `(từ ${formatTimecode(input.absoluteStart)} đến ${formatTimecode(input.absoluteEnd)} của cuộc họp; ` +
        `độ dài tệp ≈ ${formatTimecode(len)}). Mốc thời gian phải tính từ đầu TỆP NÀY (00:00).`,
    );
    if (input.chunkIndex > 0) {
      lines.push("Phần này có thể bắt đầu giữa một lượt nói — vẫn phiên âm đầy đủ từ giây đầu tiên.");
    }
  } else {
    lines.push(`Độ dài tệp ≈ ${formatTimecode(len)}.`);
  }
  if (input.roster && input.roster.length > 0) {
    lines.push("");
    lines.push("NGƯỜI NÓI ĐÃ XÁC ĐỊNH Ở PHẦN TRƯỚC — dùng lại đúng ID này khi cùng một người nói; người mới dùng ID tiếp theo:");
    for (const s of input.roster) {
      const bits = [s.name && !/^Người nói/.test(s.name) ? s.name : null, s.role, s.description].filter(Boolean);
      lines.push(`- ${s.key}: ${bits.join(" — ") || "chưa rõ tên"}`);
    }
  }
  const glossary = formatGlossary(ctx.glossary);
  if (glossary) {
    lines.push("");
    lines.push("TỪ ĐIỂN THUẬT NGỮ / TÊN RIÊNG (ưu tiên đúng chính tả này):");
    lines.push(glossary);
  }
  lines.push("");
  lines.push(
    "Hãy phiên âm NGUYÊN VĂN, ĐẦY ĐỦ toàn bộ tệp âm thanh, phân vai người nói, trả về JSON theo schema.",
  );
  return lines.join("\n");
}

/** Prompt cho lượt quét bổ sung một khoảng nghi bị bỏ sót (thời gian tương đối trong tệp đoạn). */
export function buildGapPrompt(input: ChunkPromptInput & { windowStart: number; windowEnd: number }): string {
  const base = buildChunkPrompt(input);
  return (
    base +
    `\n\nCHỈ phiên âm phần âm thanh từ ${formatTimecode(input.windowStart)} đến ${formatTimecode(input.windowEnd)} ` +
    `của tệp này (bỏ qua phần ngoài khoảng đó). Mốc thời gian vẫn tính từ đầu tệp. ` +
    `Nếu khoảng này không có lời nói, trả về danh sách segments rỗng.`
  );
}

// ---------------------------------------------------------------------------
// Bước đặt tên người nói (văn bản thuần, sau khi đã ghép toàn bộ transcript)
// ---------------------------------------------------------------------------

export const SPEAKER_NAMING_SYSTEM = `You identify speakers in a Vietnamese hospital meeting transcript that was produced by automatic diarization.

Tasks:
1. For each speaker key, infer the person's name and role from the conversation (introductions, "mời bác sĩ X", "cảm ơn thầy Y", self-references, who presents the case, who chairs and concludes, who asks questions). Use the honorific form used in the meeting (e.g. "Thầy Hiển", "BS. Quang"). Use the participants list only as supporting evidence, never as the sole reason.
2. Detect keys that are clearly the SAME person split by diarization (same name used, the same presentation continuing across keys). Only propose a merge with strong evidence.
3. Be conservative: if the evidence is weak, leave name empty and confidence "low". Never guess a name that never appears in the transcript or the participants list.

Return only JSON matching the schema.`;

export const SPEAKER_NAMING_SCHEMA = {
  type: "object",
  properties: {
    speakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string" },
        },
        required: ["key", "name", "confidence"],
      },
    },
    merges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          into: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string" },
        },
        required: ["from", "into", "confidence"],
      },
    },
  },
  required: ["speakers", "merges"],
} as const;

export interface SpeakerNamingResult {
  speakers: { key: string; name: string; role?: string; confidence: "high" | "medium" | "low"; evidence?: string }[];
  merges: { from: string; into: string; confidence: "high" | "medium" | "low"; evidence?: string }[];
}

/**
 * Nén transcript cho bước đặt tên: mở đầu cuộc họp + các câu có nhắc tên/xưng hô +
 * vài câu đầu của mỗi người nói. Giới hạn độ dài để tiết kiệm token.
 */
export function buildSpeakerNamingInput(
  ctx: MeetingContext,
  speakers: Speaker[],
  segments: { start: number; speaker: string; text: string }[],
  talkTime: Record<string, number>,
  maxChars = 60_000,
): string {
  const header = [
    "THÔNG TIN CUỘC HỌP",
    meetingHeader(ctx),
    "",
    "NGƯỜI NÓI (khoá — tên tạm — vai trò — mô tả — thời lượng nói):",
    ...speakers.map(
      (s) =>
        `- ${s.key} — ${s.name} — ${s.role ?? ""} — ${s.description ?? ""} — ${Math.round(talkTime[s.key] ?? 0)} giây`,
    ),
    "",
    "TRÍCH ĐOẠN TRANSCRIPT ([mm:ss] khoá: lời nói):",
  ].join("\n");

  const nameCue =
    /(mời|cảm ơn|cám ơn|thầy|cô|bác sĩ|bs\.?|anh|chị|em|tôi là|em là|chủ tọa|chủ trì|thư ký|trình bày|ý kiến)/i;
  const chosen = new Set<number>();
  const perSpeaker: Record<string, number> = {};
  segments.forEach((s, i) => {
    if (i < 40) chosen.add(i); // phần mở đầu
    if (nameCue.test(s.text)) {
      chosen.add(i);
      if (i + 1 < segments.length) chosen.add(i + 1); // câu tiếp theo thường là người được mời
    }
    perSpeaker[s.speaker] = (perSpeaker[s.speaker] ?? 0) + 1;
    if (perSpeaker[s.speaker] <= 6) chosen.add(i);
  });
  // 20 câu cuối (kết luận của chủ tọa)
  for (let i = Math.max(0, segments.length - 20); i < segments.length; i++) chosen.add(i);

  const lines: string[] = [];
  let used = header.length;
  for (const i of [...chosen].sort((a, b) => a - b)) {
    const s = segments[i];
    const text = s.text.length > 400 ? `${s.text.slice(0, 400)}…` : s.text;
    const line = `[${formatTimecode(s.start)}] ${s.speaker}: ${text}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return `${header}\n${lines.join("\n")}`;
}
