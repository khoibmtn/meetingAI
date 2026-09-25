import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import { blocksToDocxChildren, parseInline, parseMarkdownBlocks, markdownToDocxBlob } from "./docx";

const SAMPLE = `# TRANSCRIPT CHI TIẾT
**Chủ đề:** Gây mê hồi sức

## I. MỞ ĐẦU
* **Thầy Hiển (Chủ tọa)**: Giờ bắt đầu nhá.
  - Ý phụ
1. Rối loạn huyết động
> Ghi chú

| {{A}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM** |
|:---:|:---:|
| **BV** | **Độc lập - Tự do - Hạnh phúc** |

---
- [ ] Việc cần làm
`;

describe("markdown → docx", () => {
  it("parses blocks", () => {
    const b = parseMarkdownBlocks(SAMPLE);
    expect(b.map((x) => x.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "bullet",
      "bullet",
      "numbered",
      "quote",
      "table",
      "rule",
      "bullet",
    ]);
    const table = b.find((x) => x.type === "table");
    expect(table && table.type === "table" && table.rows.length).toBe(2);
    const nested = b[4];
    expect(nested.type === "bullet" && nested.level).toBe(1);
    const todo = b[9];
    expect(todo.type === "bullet" && todo.text).toBe("☐ Việc cần làm");
  });
  it("parses inline formatting", () => {
    expect(parseInline("**Đậm** và *nghiêng* [link](http://x)")).toEqual([
      { text: "Đậm", bold: true },
      { text: " và " },
      { text: "nghiêng", italics: true },
      { text: " link" },
    ]);
  });
  it("builds a docx", async () => {
    expect(blocksToDocxChildren(parseMarkdownBlocks(SAMPLE)).length).toBeGreaterThan(5);
    const blob = await markdownToDocxBlob(SAMPLE, "Thử");
    expect(blob.size).toBeGreaterThan(3000);
    expect(typeof Packer.toBlob).toBe("function");
  });
});
