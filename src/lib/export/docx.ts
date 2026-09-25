import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from "docx";

/**
 * Chuyển Markdown (báo cáo, biên bản do AI soạn) sang DOCX theo thể thức văn bản hành chính:
 * khổ A4, lề trên/dưới 20 mm, trái 30 mm, phải 15 mm, Times New Roman 13 (Phụ lục I, NĐ 30/2020/NĐ-CP).
 */

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; level: number; text: string }
  | { type: "numbered"; level: number; marker: string; text: string }
  | { type: "quote"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "rule" };

/** Phân tích Markdown thành các khối (đủ cho văn bản báo cáo; không cần CommonMark đầy đủ). */
export function parseMarkdownBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ type: "paragraph", text: para.join(" ").trim() });
      para = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*(#{1,6})\s+(.*)$/))) {
      flush();
      blocks.push({ type: "heading", level: m[1].length, text: m[2].replace(/\s#+\s*$/, "") });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
    } else if (line.trimStart().startsWith("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) rows.push(cells);
        else if (cells.some((c) => /^:?-{2,}:?$/.test(c))) {
          /* dòng phân cách tiêu đề */
        } else rows.push(cells);
        i++;
      }
      i--;
      blocks.push({ type: "table", rows });
    } else if ((m = line.match(/^(\s*)[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/))) {
      flush();
      const check = m[2] === undefined ? "" : m[2].trim() ? "☑ " : "☐ ";
      blocks.push({ type: "bullet", level: Math.floor(m[1].length / 2), text: check + m[3] });
    } else if ((m = line.match(/^(\s*)(\d+[.)])\s+(.*)$/))) {
      flush();
      blocks.push({ type: "numbered", level: Math.floor(m[1].length / 2), marker: m[2], text: m[3] });
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flush();
      blocks.push({ type: "quote", text: m[1] });
    } else {
      // Dòng kết thúc bằng 2 dấu cách = xuống dòng cứng; gộp tiếp vào đoạn
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Tách định dạng nội dòng: **đậm**, *nghiêng*, `mã`, [chữ](link). */
export function parseInline(text: string): { text: string; bold?: boolean; italics?: boolean }[] {
  const out: { text: string; bold?: boolean; italics?: boolean }[] = [];
  const cleaned = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<br\s*\/?>/gi, "\n");
  const re = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    if (m.index > last) out.push({ text: cleaned.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("***")) out.push({ text: tok.slice(3, -3), bold: true, italics: true });
    else if (tok.startsWith("**") || tok.startsWith("__")) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1) });
    else out.push({ text: tok.slice(1, -1), italics: true });
    last = m.index + tok.length;
  }
  if (last < cleaned.length) out.push({ text: cleaned.slice(last) });
  return out.filter((r) => r.text.length > 0);
}

function runs(text: string, extra: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return parseInline(text).flatMap((r) => {
    const parts = r.text.split("\n");
    return parts.map(
      (p, idx) =>
        new TextRun({
          text: p,
          bold: r.bold || extra.bold,
          italics: r.italics || extra.italics,
          size: extra.size,
          break: idx > 0 ? 1 : undefined,
        }),
    );
  });
}

function isCenteredTitle(text: string) {
  const plain = text.replace(/[*_`]/g, "").trim();
  return /^\*\*[^*]+\*\*$/.test(text.trim()) && plain.length > 0 && plain === plain.toUpperCase() && plain.length < 150;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

export function blocksToDocxChildren(blocks: Block[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        children.push(
          new Paragraph({
            heading: HEADINGS[Math.min(b.level, 6) - 1],
            alignment: b.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 200, after: 100 },
            children: runs(b.text, { bold: true }),
          }),
        );
        break;
      case "paragraph": {
        const opts: IParagraphOptions = {
          alignment: isCenteredTitle(b.text) ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          indent: isCenteredTitle(b.text) ? undefined : { firstLine: 0 },
          children: runs(b.text),
        };
        children.push(new Paragraph(opts));
        break;
      }
      case "bullet":
        children.push(
          new Paragraph({
            bullet: { level: Math.min(b.level, 8) },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 60 },
            children: runs(b.text),
          }),
        );
        break;
      case "numbered":
        children.push(
          new Paragraph({
            indent: { left: 360 + b.level * 360, hanging: 360 },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 60 },
            children: [new TextRun({ text: `${b.marker} ` }), ...runs(b.text)],
          }),
        );
        break;
      case "quote":
        children.push(
          new Paragraph({
            indent: { left: 567 },
            spacing: { after: 80 },
            children: runs(b.text, { italics: true }),
          }),
        );
        break;
      case "rule":
        children.push(new Paragraph({ children: [] }));
        break;
      case "table": {
        const cols = Math.max(...b.rows.map((r) => r.length), 1);
        const joined = b.rows.flat().join(" ");
        // Bảng "phần đầu văn bản" hoặc "chữ ký" theo NĐ 30 → không kẻ khung, căn giữa
        const layout = /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM|THƯ KÝ|CHỦ TỌA|NGƯỜI LẬP|THỦ TRƯỞNG/i.test(joined);
        const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        const line = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
        const border = layout ? none : line;
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
            rows: b.rows.map(
              (r, ri) =>
                new TableRow({
                  children: Array.from({ length: cols }, (_, ci) =>
                    new TableCell({
                      width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          alignment: layout ? AlignmentType.CENTER : AlignmentType.LEFT,
                          children: runs(r[ci] ?? "", { bold: !layout && ri === 0 }),
                        }),
                      ],
                    }),
                  ),
                }),
            ),
          }),
        );
        children.push(new Paragraph({ children: [] }));
        break;
      }
    }
  }
  return children;
}

export async function markdownToDocxBlob(markdown: string, title: string): Promise<Blob> {
  const doc = new Document({
    title,
    creator: "MeetingAI",
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 26 }, paragraph: { spacing: { line: 276 } } },
        heading1: { run: { font: "Times New Roman", size: 28, bold: true, color: "000000" } },
        heading2: { run: { font: "Times New Roman", size: 26, bold: true, color: "000000" } },
        heading3: { run: { font: "Times New Roman", size: 26, bold: true, italics: true, color: "000000" } },
        heading4: { run: { font: "Times New Roman", size: 26, bold: true, color: "000000" } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: "210mm", height: "297mm" },
            margin: { top: "20mm", bottom: "20mm", left: "30mm", right: "15mm" },
          },
        },
        children: blocksToDocxChildren(parseMarkdownBlocks(markdown)),
      },
    ],
  });
  return Packer.toBlob(doc);
}
