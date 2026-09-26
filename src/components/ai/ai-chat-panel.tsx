"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookmarkPlusIcon, CopyIcon, HistoryIcon, PlusIcon, SendHorizontalIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConnectionSelect } from "./connection-select";
import { useConnectionChoice, useConnections } from "./use-connections";
import { readTextStream } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Msg {
  id?: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface SourceRef {
  code: string;
  recordingId: string;
  title: string;
}

export interface AiChatPanelProps {
  recordingId?: string;
  groupId?: string;
  /** Nhóm: danh sách bản ghi được chọn làm nguồn (rỗng = tất cả). */
  sourceIds?: string[];
  suggestions?: string[];
  onCite?: (source: SourceRef | null, seconds: number) => void;
  onSaveNote?: (content: string) => void;
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Tóm tắt các ý chính của buổi họp",
  "Chủ tọa đã kết luận những gì?",
  "Liệt kê các số liệu lâm sàng, cận lâm sàng được nêu",
  "Những bài học kinh nghiệm nào được rút ra?",
  "Ai đã phát biểu và mỗi người nêu ý gì?",
];

export function AiChatPanel({ recordingId, groupId, sourceIds, suggestions = DEFAULT_SUGGESTIONS, onCite, onSaveNote, className }: AiChatPanelProps) {
  const { state: conns } = useConnections();
  const [connectionId, setConnectionId] = useConnectionChoice(conns, "chat");
  const [conversations, setConversations] = useState<{ id: string; title: string | null; updated_at: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const supabase = createClient();
    let q = supabase.from("ai_conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
    q = recordingId ? q.eq("recording_id", recordingId) : q.eq("group_id", groupId!);
    const { data } = await q;
    setConversations(data ?? []);
  }, [recordingId, groupId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  async function openConversation(id: string) {
    setConversationId(id);
    const { data } = await createClient()
      .from("ai_messages")
      .select("id,role,content")
      .eq("conversation_id", id)
      .order("created_at");
    setMessages((data ?? []).map((m) => ({ id: m.id, role: m.role as Msg["role"], content: m.content })));
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", pending: true }]);
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, recordingId, groupId, sourceIds, message: question, connectionId }),
        signal: abortRef.current.signal,
      });
      const convId = res.headers.get("x-conversation-id");
      const src = res.headers.get("x-sources");
      if (src) setSources(JSON.parse(decodeURIComponent(src)));
      const skipped = res.headers.get("x-skipped-sources");
      if (skipped) toast.warning(`Một số bản ghi vượt giới hạn ngữ cảnh nên chưa đưa vào: ${JSON.parse(decodeURIComponent(skipped)).join(", ")}`);
      await readTextStream(
        res,
        (full) => setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, content: full } : x))),
        abortRef.current.signal,
      );
      if (convId && convId !== conversationId) {
        setConversationId(convId);
        loadConversations();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error((e as Error).message);
        setMessages((m) => m.map((x, i) => (i === m.length - 1 && x.role === "assistant" ? { ...x, content: x.content || `⚠️ ${(e as Error).message}` } : x)));
      }
    } finally {
      setMessages((m) => m.map((x) => ({ ...x, pending: false })));
      setBusy(false);
    }
  }

  function cite(code: string | null, seconds: number) {
    const source = code ? (sources.find((s) => s.code === code) ?? null) : (sources[0] ?? null);
    onCite?.(source, seconds);
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <ConnectionSelect state={conns} usage="chat" value={connectionId} onChange={setConnectionId} size="sm" className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label="Lịch sử hỏi đáp">
              <HistoryIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Hội thoại trước</DropdownMenuLabel>
            {conversations.length === 0 ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Chưa có</div> : null}
            {conversations.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => openConversation(c.id)}>
                <span className="truncate">{c.title ?? "Hội thoại"}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{format(new Date(c.updated_at), "dd/MM")}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Hội thoại mới"
          onClick={() => {
            setConversationId(null);
            setMessages([]);
          }}
        >
          <PlusIcon />
        </Button>
      </div>

      <div className="min-h-[240px] flex-1 space-y-4 overflow-y-auto rounded-xl border bg-muted/20 p-3">
        {messages.length === 0 ? (
          <div className="space-y-3 py-4 text-center">
            <SparklesIcon className="mx-auto size-8 text-primary" />
            <p className="text-sm text-muted-foreground">
              Hỏi bất cứ điều gì về nội dung {groupId ? "các bản ghi trong nhóm" : "bản ghi này"}. Câu trả lời có trích dẫn mốc thời gian — bấm để nghe lại.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
              {m.content}
            </div>
          ) : (
            <div key={i} className="group/msg max-w-full space-y-1">
              {m.content ? (
                <Markdown onCite={cite}>{m.content}</Markdown>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-primary" /> Đang đọc nội dung và soạn trả lời…
                </div>
              )}
              {!m.pending && m.content ? (
                <div className="flex gap-1 opacity-70 group-hover/msg:opacity-100">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigator.clipboard.writeText(m.content).then(() => toast.success("Đã sao chép"))}>
                    <CopyIcon /> Sao chép
                  </Button>
                  {onSaveNote ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSaveNote(m.content)}>
                      <BookmarkPlusIcon /> Lưu vào ghi chú
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Đặt câu hỏi… (Enter để gửi, Shift+Enter xuống dòng)"
          className="min-h-11 resize-none"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Dừng">
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Gửi">
            <SendHorizontalIcon />
          </Button>
        )}
      </form>
    </div>
  );
}
