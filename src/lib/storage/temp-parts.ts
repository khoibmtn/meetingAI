/** Tệp tạm được lưu thành nhiều phần, tên phần = vị trí byte bắt đầu (đệm 12 chữ số để sắp xếp đúng). */
export interface StoredPart {
  name: string;
  offset: number;
  size: number;
}

export const partName = (offset: number) => `${String(offset).padStart(12, "0")}.part`;

export function parsePart(name: string, size: number): StoredPart | null {
  const m = /^(\d{12})\.part$/.exec(name);
  return m ? { name, offset: Number(m[1]), size } : null;
}

/** Số byte liền mạch tính từ 0 — cũng là vị trí cần gửi tiếp khi tải lên dở dang. */
export function contiguousBytes(parts: StoredPart[]): number {
  let next = 0;
  for (const p of [...parts].sort((a, b) => a.offset - b.offset)) {
    if (p.offset > next) break;
    next = Math.max(next, p.offset + p.size);
  }
  return next;
}

/** Các phần tạo nên tệp liền mạch [0, total), theo thứ tự; null nếu thiếu hoặc chồng lấn. */
export function orderedParts(parts: StoredPart[], total: number): StoredPart[] | null {
  const out: StoredPart[] = [];
  let next = 0;
  for (const p of [...parts].sort((a, b) => a.offset - b.offset)) {
    if (p.offset !== next || p.size <= 0) return null;
    out.push(p);
    next += p.size;
    if (next === total) return out;
  }
  return next === total ? out : null;
}
