import "server-only";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Soniox async STT (stt-async-v5): nhận cả tệp dài (tới 300 phút), phân vai bằng đặc trưng giọng nói,
 * hỗ trợ ngữ cảnh (context) gồm thông tin chung, đoạn mô tả và danh sách thuật ngữ.
 * API theo mẫu chính thức: github.com/soniox/soniox_examples (speech_to_text/nodejs/soniox_async.js)
 */
const DEFAULT_BASE = "https://api.soniox.com";

export interface SonioxConn {
  apiKey: string;
  baseUrl?: string | null;
  model?: string;
}

export interface SonioxToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
  speaker?: string;
  language?: string;
  translation_status?: string;
}

export interface SonioxContext {
  general?: { key: string; value: string }[];
  text?: string;
  terms?: string[];
}

async function sonioxFetch<T>(conn: SonioxConn, endpoint: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${conn.apiKey}`);
  const base = (conn.baseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}${endpoint}`, { ...init, headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    const hint = res.status === 401 ? " (khoá API Soniox không hợp lệ)" : "";
    throw new Error(`Soniox lỗi ${res.status}${hint}: ${msg.slice(0, 300)}`);
  }
  return (init.method === "DELETE" ? null : await res.json()) as T;
}

export async function sonioxUploadFile(conn: SonioxConn, filePath: string, mimeType: string): Promise<string> {
  const data = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([data], { type: mimeType }), basename(filePath));
  const res = await sonioxFetch<{ id: string }>(conn, "/v1/files", { method: "POST", body: form });
  return res.id;
}

export async function sonioxCreateTranscription(
  conn: SonioxConn,
  opts: {
    fileId: string;
    model?: string;
    languageHints?: string[];
    context?: SonioxContext;
    webhookUrl?: string;
    webhookSecret?: string;
    reference?: string;
  },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model ?? conn.model ?? "stt-async-v5",
    file_id: opts.fileId,
    language_hints: opts.languageHints ?? ["vi", "en"],
    enable_language_identification: true,
    enable_speaker_diarization: true,
    context: opts.context,
    client_reference_id: opts.reference,
  };
  if (opts.webhookUrl) {
    body.webhook_url = opts.webhookUrl;
    if (opts.webhookSecret) {
      body.webhook_auth_header_name = "x-webhook-secret";
      body.webhook_auth_header_value = opts.webhookSecret;
    }
  }
  const res = await sonioxFetch<{ id: string }>(conn, "/v1/transcriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.id;
}

export async function sonioxGetStatus(conn: SonioxConn, transcriptionId: string) {
  return sonioxFetch<{ status: "queued" | "processing" | "completed" | "error"; error_message?: string }>(
    conn,
    `/v1/transcriptions/${transcriptionId}`,
  );
}

export async function sonioxGetTokens(conn: SonioxConn, transcriptionId: string): Promise<SonioxToken[]> {
  const res = await sonioxFetch<{ tokens: SonioxToken[] }>(conn, `/v1/transcriptions/${transcriptionId}/transcript`);
  return res.tokens ?? [];
}

export async function sonioxCleanup(conn: SonioxConn, transcriptionId?: string, fileId?: string) {
  await Promise.allSettled([
    transcriptionId ? sonioxFetch(conn, `/v1/transcriptions/${transcriptionId}`, { method: "DELETE" }) : null,
    fileId ? sonioxFetch(conn, `/v1/files/${fileId}`, { method: "DELETE" }) : null,
  ]);
}
