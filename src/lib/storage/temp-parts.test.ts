import { describe, expect, it } from "vitest";
import { contiguousBytes, orderedParts, parsePart, partName } from "./temp-parts";

const MiB = 1024 * 1024;
const part = (offset: number, size: number) => ({ name: partName(offset), offset, size });

describe("tệp tạm chia phần", () => {
  it("tên phần đệm 12 chữ số, sắp xếp theo tên = theo vị trí", () => {
    expect(partName(0)).toBe("000000000000.part");
    expect(partName(4 * MiB)).toBe("000004194304.part");
    const names = [partName(12 * MiB), partName(4 * MiB), partName(0), partName(8 * MiB)].sort();
    expect(names.map((n) => parsePart(n, 1)!.offset)).toEqual([0, 4 * MiB, 8 * MiB, 12 * MiB]);
  });

  it("bỏ qua tệp không đúng định dạng", () => {
    expect(parsePart("abc.part", 1)).toBeNull();
    expect(parsePart("000000000000.part.tmp", 1)).toBeNull();
    expect(parsePart(".emptyFolderPlaceholder", 0)).toBeNull();
  });

  it("vị trí tiếp tục = số byte liền mạch từ 0", () => {
    expect(contiguousBytes([])).toBe(0);
    expect(contiguousBytes([part(0, 4 * MiB), part(4 * MiB, 4 * MiB)])).toBe(8 * MiB);
    // thiếu phần giữa → chỉ tính tới chỗ thiếu
    expect(contiguousBytes([part(0, 4 * MiB), part(8 * MiB, 4 * MiB)])).toBe(4 * MiB);
    // thiếu phần đầu
    expect(contiguousBytes([part(4 * MiB, 4 * MiB)])).toBe(0);
  });

  it("ghép đúng thứ tự khi đủ phần, từ chối khi thiếu/chồng lấn/dư", () => {
    const total = 9 * MiB + 123;
    const parts = [part(8 * MiB, MiB + 123), part(0, 4 * MiB), part(4 * MiB, 4 * MiB)];
    expect(orderedParts(parts, total)?.map((p) => p.offset)).toEqual([0, 4 * MiB, 8 * MiB]);
    expect(orderedParts(parts.slice(1), total)).toBeNull(); // thiếu phần cuối
    expect(orderedParts([part(0, 4 * MiB), part(2 * MiB, 4 * MiB)], 6 * MiB)).toBeNull(); // chồng lấn
    expect(orderedParts(parts, 8 * MiB)).toEqual(parts.slice(1, 3).sort((a, b) => a.offset - b.offset)); // phần thừa phía sau bị bỏ
    expect(orderedParts([part(0, 0)], 0)).toBeNull();
  });
});
