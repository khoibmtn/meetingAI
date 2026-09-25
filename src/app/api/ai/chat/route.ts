import { type NextRequest } from "next/server";
import { jsonError, requireApiUser, HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamText } from "@/lib/ai";
import { markAuthFailure, requireConnection } from "@/lib/ai/connections";
import { buildQaContext } from "@/lib/ai/qa";
import { textStreamResponse } from "@/lib/http/stream";

export const maxDuration = 300;

interface Body {
  conversationId?: string;
  recordingId?: string;
  groupId?: string;
  sourceIds?: string[];
  message: string;
  connectionId?: string;
}

/**
 * Hỏi đáp trên nội dung bản ghi (1 bản ghi) hoặc nhóm (nhiều bản ghi được chia sẻ vào nhóm).
 * Lịch sử hội thoại lưu riêng cho từng người.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireApiUser();
    const body = (await request.json()) as Body;
    const message = body.message?.trim();
    if (!message) throw new HttpError(400, "Câu hỏi trống");
    const admin = createAdminClient();

    // Xác định nguồn
    let sourceIds: string[] = [];
    if (body.recordingId) {
      sourceIds = [body.recordingId];
    } else if (body.groupId) {
      // RLS: chỉ thành viên nhóm mới thấy các lượt chia sẻ vào nhóm
      const { data: shares } = await supabase.from("recording_shares").select("recording_id").eq("group_id", body.groupId);
      const groupRecs = (shares ?? []).map((s) => s.recording_id);
      sourceIds = body.sourceIds?.length ? body.sourceIds.filter((s) => groupRecs.includes(s)) : groupRecs;
    }
    if (!sourceIds.length) throw new HttpError(400, "Chưa chọn nguồn (bản ghi) để hỏi đáp");
    // RLS: chỉ giữ bản ghi người dùng được xem
    const { data: visible } = await supabase.from("recordings").select("id").in("id", sourceIds);
    sourceIds = (visible ?? []).map((r) => r.id);
    if (!sourceIds.length) throw new HttpError(403, "Không có quyền xem các nguồn đã chọn");

    const conn = await requireConnection("chat", user.id, body.connectionId);
    const { system, sources, skipped } = await buildQaContext(sourceIds, conn.provider);
    if (!sources.length) throw new HttpError(400, "Các nguồn đã chọn chưa có transcript");

    // Hội thoại
    let conversationId = body.conversationId;
    if (conversationId) {
      const { data: conv } = await admin.from("ai_conversations").select("id,user_id").eq("id", conversationId).maybeSingle();
      if (!conv || conv.user_id !== user.id) conversationId = undefined;
    }
    if (!conversationId) {
      const { data: conv, error } = await admin
        .from("ai_conversations")
        .insert({
          user_id: user.id,
          recording_id: body.recordingId ?? null,
          group_id: body.groupId ?? null,
          title: message.slice(0, 120),
          source_ids: sourceIds,
        })
        .select("id")
        .single();
      if (error || !conv) throw new Error(error?.message ?? "Không tạo được hội thoại");
      conversationId = conv.id;
    } else {
      await admin.from("ai_conversations").update({ source_ids: sourceIds }).eq("id", conversationId);
    }
    const { data: history } = await admin
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: message });

    const messages = [
      ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    async function* run() {
      try {
        yield* streamText({ conn, system, messages, minOutputTokens: 8000 });
      } catch (err) {
        await markAuthFailure(conn, err);
        throw err;
      }
    }

    return textStreamResponse(run(), {
      headers: {
        "x-conversation-id": conversationId!,
        "x-sources": encodeURIComponent(JSON.stringify(sources)),
        ...(skipped.length ? { "x-skipped-sources": encodeURIComponent(JSON.stringify(skipped)) } : {}),
      },
      onDone: async (text) => {
        await admin.from("ai_messages").insert({
          conversation_id: conversationId!,
          role: "assistant",
          content: text,
          provider: conn.provider,
          model: conn.model,
        });
        await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId!);
      },
      onError: async (err, partial) => {
        await admin.from("ai_messages").insert({
          conversation_id: conversationId!,
          role: "assistant",
          content: `${partial}\n\n> ⚠️ ${err instanceof Error ? err.message : String(err)}`,
          provider: conn.provider,
          model: conn.model,
        });
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
