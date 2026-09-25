"use client";

/** Gọi API JSON; ném Error với thông báo tiếng Việt từ server. */
export async function apiJson<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `Lỗi ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Đọc phản hồi dạng stream văn bản, gọi onText với toàn bộ nội dung đã nhận.
 * Server báo lỗi giữa chừng bằng dòng "[[ERROR]] ..." → ném Error.
 */
export async function readTextStream(res: Response, onText: (full: string) => void, signal?: AbortSignal): Promise<string> {
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      msg = JSON.parse(t).error ?? t;
    } catch {
      /* văn bản thuần */
    }
    throw new Error(msg || `Lỗi ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    const errIdx = full.indexOf("[[ERROR]]");
    if (errIdx >= 0) {
      onText(full.slice(0, errIdx).trimEnd());
      throw new Error(full.slice(errIdx + 9).trim());
    }
    onText(full);
  }
  full += decoder.decode();
  onText(full);
  return full;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "tai-lieu";
}
