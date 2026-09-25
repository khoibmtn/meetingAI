/**
 * Phân tích JSON "dễ dãi": bỏ code fence, và nếu đầu ra bị cắt cụt (hết token) thì cắt về
 * phần tử mảng hoàn chỉnh cuối cùng rồi đóng ngoặc. Dùng cho kết quả phiên âm dài.
 */
export function parseJsonLoose<T = unknown>(input: string): { value: T; repaired: boolean } {
  const text = stripFences(input).trim();
  try {
    return { value: JSON.parse(text) as T, repaired: false };
  } catch {
    // tiếp tục sửa
  }
  const start = text.search(/[[{]/);
  if (start < 0) throw new SyntaxError("Không tìm thấy JSON trong phản hồi");
  const body = text.slice(start);

  // Quét, ghi lại các vị trí kết thúc một phần tử trong mảng, cùng ngăn xếp ngoặc tại đó
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  const cutPoints: { index: number; closers: string }[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack[stack.length - 1] === "[") {
        cutPoints.push({ index: i, closers: closersFor(stack) });
      }
      if (stack.length === 0) {
        // JSON hoàn chỉnh nhưng có rác phía sau
        try {
          return { value: JSON.parse(body.slice(0, i + 1)) as T, repaired: true };
        } catch {
          break;
        }
      }
    }
  }
  for (let k = cutPoints.length - 1; k >= 0; k--) {
    const { index, closers } = cutPoints[k];
    const candidate = body.slice(0, index + 1) + closers;
    try {
      return { value: JSON.parse(candidate) as T, repaired: true };
    } catch {
      // thử điểm cắt trước đó
    }
  }
  throw new SyntaxError("Không sửa được JSON bị cắt cụt");
}

function closersFor(stack: string[]): string {
  return [...stack]
    .reverse()
    .map((c) => (c === "{" ? "}" : "]"))
    .join("");
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}
