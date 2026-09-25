import "server-only";
import { FileState, type GoogleGenAI } from "@google/genai";
import { geminiClientFor, geminiThinking, mapGeminiError } from "@/lib/ai/providers/gemini";
import type { ConnectionConfig } from "@/lib/ai/types";
import { parseJsonLoose } from "@/lib/json-repair";
import { sleep } from "@/lib/utils";
import { TRANSCRIPTION_SCHEMA, TRANSCRIPTION_SYSTEM_PROMPT } from "./prompts";
import type { RawChunkResult } from "./types";

export interface GeminiFileRef {
  name: string;
  uri: string;
  mimeType: string;
}

export function createGemini(conn: Pick<ConnectionConfig, "apiKey" | "baseUrl">): GoogleGenAI {
  return geminiClientFor(conn);
}

/** Tải tệp lên Gemini Files API và chờ tới khi ACTIVE (tệp tự xoá sau 48 giờ). */
export async function uploadToGemini(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string,
  displayName: string,
): Promise<GeminiFileRef> {
  try {
    let file = await ai.files.upload({ file: filePath, config: { mimeType, displayName } });
    const deadline = Date.now() + 120_000;
    while (file.state === FileState.PROCESSING && Date.now() < deadline) {
      await sleep(2000);
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state === FileState.FAILED) throw new Error(`Gemini không xử lý được tệp ${displayName}`);
    if (!file.uri || !file.name) throw new Error("Gemini không trả về URI tệp");
    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType };
  } catch (err) {
    throw mapGeminiError(err);
  }
}

export async function deleteGeminiFile(ai: GoogleGenAI, name: string) {
  try {
    await ai.files.delete({ name });
  } catch {
    // Tệp tự hết hạn sau 48 giờ — bỏ qua lỗi dọn dẹp
  }
}

export interface TranscribeCallResult {
  result: RawChunkResult;
  repaired: boolean;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Gọi Gemini phiên âm một tệp âm thanh với đầu ra JSON có cấu trúc.
 * Dùng streaming để tránh time-out khi phản hồi dài; tự sửa JSON nếu bị cắt cụt.
 */
export async function transcribeWithGemini(
  ai: GoogleGenAI,
  conn: Pick<ConnectionConfig, "model" | "params">,
  file: GeminiFileRef,
  userPrompt: string,
): Promise<TranscribeCallResult> {
  const model = conn.model;
  const p = conn.params ?? {};
  let text = "";
  let finishReason: string | undefined;
  let usage: TranscribeCallResult["usage"];
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: [
        {
          role: "user",
          parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: userPrompt }],
        },
      ],
      config: {
        systemInstruction: TRANSCRIPTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: TRANSCRIPTION_SCHEMA,
        maxOutputTokens: Math.max(p.maxOutputTokens ?? 65536, 32768),
        ...(p.temperature != null ? { temperature: p.temperature } : {}),
        ...(p.topP != null ? { topP: p.topP } : {}),
        // Phiên âm là tác vụ nhận dạng — mặc định suy luận thấp để nhanh và tránh "sáng tác";
        // người dùng có thể nâng mức suy luận trong cấu hình kết nối.
        thinkingConfig: geminiThinking(model, p.effort ?? "low"),
        ...(p.extra ?? {}),
      },
    });
    for await (const chunk of stream) {
      text += chunk.text ?? "";
      const c = chunk.candidates?.[0];
      if (c?.finishReason) finishReason = c.finishReason;
      if (chunk.usageMetadata) {
        usage = {
          inputTokens: chunk.usageMetadata.promptTokenCount,
          outputTokens: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }
  } catch (err) {
    throw mapGeminiError(err);
  }
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "RECITATION") {
    throw new Error(`Gemini dừng phiên âm (lý do: ${finishReason})`);
  }
  if (!text.trim()) throw new Error("Gemini trả về kết quả rỗng");
  const { value, repaired } = parseJsonLoose<RawChunkResult>(text);
  const result: RawChunkResult = {
    segments: Array.isArray(value?.segments) ? value.segments : [],
    speakers: Array.isArray(value?.speakers) ? value.speakers : [],
    truncated: repaired || finishReason === "MAX_TOKENS",
  };
  return { result, repaired, finishReason, usage };
}
