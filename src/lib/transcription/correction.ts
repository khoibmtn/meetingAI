import "server-only";
import { generateJson, type ConnectionConfig, type UsageContext } from "@/lib/ai";
import { stripDiacritics } from "@/lib/utils";
import { formatGlossary } from "./prompts";
import type { GlossaryEntry } from "./glossary-defaults";
import type { Segment } from "./types";

/**
 * Hiệu đính thuật ngữ an toàn: mô hình chỉ ĐỀ XUẤT thay thế cụm từ (find → replace) trong từng câu,
 * mã nguồn kiểm tra và chỉ áp dụng khi hợp lệ. Không bao giờ để mô hình viết lại/xoá câu.
 */
const SYSTEM = `You fix transcription errors in a Vietnamese medical meeting transcript produced by speech recognition.
Only correct misrecognized domain terms: drug names, medical terms, abbreviations, units, lab values, and people's names — using the glossary and context.
Rules:
- Propose minimal edits as {id, find, replace}. "find" MUST be an exact substring of that segment's text (copy it character by character).
- Never rephrase, summarize, reorder, or remove content. Never change meaning. Do not fix grammar or style.
- Only propose an edit when you are confident it is a recognition error.
Return only JSON matching the schema.`;

const SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          find: { type: "string" },
          replace: { type: "string" },
        },
        required: ["id", "find", "replace"],
      },
    },
  },
  required: ["edits"],
} as const;

interface Edit {
  id: string;
  find: string;
  replace: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Kiểm tra một đề xuất sửa có "an toàn" không. */
export function isSafeEdit(text: string, edit: Edit, glossaryTerms: Set<string>): boolean {
  const find = edit.find;
  const replace = edit.replace;
  if (!find || find === replace || find.length > 80 || replace.length > 120) return false;
  if (!text.includes(find)) return false;
  if (replace.length > find.length * 2.5 + 8) return false;
  const a = stripDiacritics(find.toLowerCase());
  const b = stripDiacritics(replace.toLowerCase());
  const similarity = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const inGlossary = [...glossaryTerms].some((t) => b.includes(t) && t.length >= 3);
  return similarity >= 0.45 || (inGlossary && similarity >= 0.2);
}

export async function correctTerms(opts: {
  segments: Segment[];
  glossary: GlossaryEntry[];
  conn: ConnectionConfig;
  contextLine: string;
  deadline: number;
  usage?: UsageContext;
}): Promise<{ segments: Segment[]; applied: number }> {
  const glossaryText = formatGlossary(opts.glossary, 300);
  const terms = new Set(opts.glossary.map((g) => stripDiacritics(g.term.toLowerCase())));
  const byId = new Map(opts.segments.map((s) => [s.id, { ...s }]));
  let applied = 0;
  const batchSize = 150;
  for (let i = 0; i < opts.segments.length; i += batchSize) {
    if (Date.now() > opts.deadline) break;
    const batch = opts.segments.slice(i, i + batchSize);
    const body = batch.map((s) => `${s.id}|${s.text}`).join("\n");
    let edits: Edit[] = [];
    try {
      const res = await generateJson<{ edits: Edit[] }>({
        conn: opts.conn,
        system: SYSTEM,
        schema: SCHEMA as unknown as Record<string, unknown>,
        schemaName: "edits",
        overrides: { effort: opts.conn.params.effort ?? "low" },
        usage: opts.usage,
        messages: [
          {
            role: "user",
            content: `${opts.contextLine}\n\nGLOSSARY:\n${glossaryText}\n\nSEGMENTS (id|text):\n${body}`,
          },
        ],
      });
      edits = res.edits ?? [];
    } catch {
      continue; // bỏ qua lô lỗi — transcript gốc vẫn nguyên vẹn
    }
    for (const e of edits) {
      const seg = byId.get(e.id);
      if (!seg || !isSafeEdit(seg.text, e, terms)) continue;
      seg.text = seg.text.replace(e.find, e.replace);
      seg.flags = seg.flags?.includes("term_corrected") ? seg.flags : [...(seg.flags ?? []), "term_corrected"];
      applied++;
    }
  }
  return { segments: opts.segments.map((s) => byId.get(s.id)!), applied };
}
