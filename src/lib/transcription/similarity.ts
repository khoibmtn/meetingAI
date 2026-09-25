import { stripDiacritics } from "@/lib/utils";

/** Chuẩn hoá để so khớp: bỏ dấu, chữ thường, bỏ dấu câu, tách từ. */
export function tokens(text: string): string[] {
  return stripDiacritics(text.toLowerCase())
    .replace(/\[[^\]]*\]/g, " ") // bỏ chú thích [cười], [không nghe rõ]
    .replace(/[^a-z0-9%/.]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[./]+|[./]+$/g, ""))
    .filter((t) => t.length > 0);
}

function counts(ts: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function intersectionSize(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0;
  for (const [k, v] of a) n += Math.min(v, b.get(k) ?? 0);
  return n;
}

/** Hệ số Dice trên đa tập từ (0..1). */
export function diceSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  return (2 * intersectionSize(counts(ta), counts(tb))) / (ta.length + tb.length);
}

/** Tỷ lệ bao hàm: phần của chuỗi ngắn hơn nằm trong chuỗi dài hơn (0..1). */
export function containment(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const minLen = Math.min(ta.length, tb.length);
  if (minLen === 0) return 0;
  return intersectionSize(counts(ta), counts(tb)) / minLen;
}

/** Hai câu được coi là trùng (do chồng lấn hoặc lặp lại) nếu gần như giống hệt hoặc câu này chứa câu kia. */
export function isNearDuplicate(a: string, b: string): boolean {
  const la = tokens(a).length;
  const lb = tokens(b).length;
  if (Math.min(la, lb) === 0) return false;
  if (diceSimilarity(a, b) >= 0.85) return true;
  // Câu ngắn (<4 từ) dễ trùng ngẫu nhiên ("dạ vâng") — chỉ coi trùng khi gần như y hệt
  if (Math.min(la, lb) < 4) return false;
  return containment(a, b) >= 0.85;
}
