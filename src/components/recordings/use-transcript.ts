"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import type { Segment, Speaker } from "@/lib/transcription/types";
import { assignIds, consolidateMinorSpeakers } from "@/lib/transcription/merge";
import { stripDiacritics } from "@/lib/utils";

export interface TranscriptState {
  segments: Segment[];
  speakers: Speaker[];
  version: number;
}

/**
 * Quản lý transcript phía client: sửa câu, đổi người nói, đổi tên/gộp người nói.
 * - Lưu có kiểm tra phiên bản (optimistic concurrency) để không ghi đè sửa đổi của người khác.
 * - Các lần lưu xếp hàng tuần tự và luôn áp dụng lên bản mới nhất (không mất thay đổi khi thao tác nhanh).
 * - Tự nhận bản mới hơn từ máy chủ (vd. phiên âm xong → router.refresh()).
 */
export function useTranscript(recordingId: string, initial: TranscriptState | null, userId: string) {
  const [state, setState] = useState<TranscriptState | null>(initial);
  const [serverVersion, setServerVersion] = useState<number | null>(initial?.version ?? null);
  const [saving, setSaving] = useState(false);
  const latest = useRef<TranscriptState | null>(state);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const incoming = initial?.version ?? null;
  if (incoming !== serverVersion) {
    setServerVersion(incoming);
    if (initial && (!state || initial.version > state.version)) setState(initial);
  }
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const commit = useCallback((next: TranscriptState) => {
    latest.current = next;
    setState(next);
  }, []);

  const save = useCallback(
    async (next: TranscriptState): Promise<boolean> => {
      setSaving(true);
      const supabase = createClient();
      const searchText = stripDiacritics(
        [...next.speakers.map((s) => s.name), ...next.segments.map((s) => s.text)].join(" ").toLowerCase(),
      );
      const { data, error } = await supabase
        .from("transcripts")
        .update({
          segments: next.segments as unknown as Json,
          speakers: next.speakers as unknown as Json,
          search_text: searchText,
          version: next.version + 1,
          edited_by: userId,
        })
        .eq("recording_id", recordingId)
        .eq("version", next.version)
        .select("version");
      setSaving(false);
      if (error) {
        toast.error(`Không lưu được: ${error.message}`);
        return false;
      }
      if (!data || data.length === 0) {
        toast.error("Transcript vừa được người khác sửa. Tải lại trang để xem bản mới nhất.");
        return false;
      }
      commit({ ...next, version: data[0].version });
      return true;
    },
    [recordingId, userId, commit],
  );

  /** Xếp hàng một thay đổi; `fn` nhận bản mới nhất tại thời điểm lưu. */
  const mutate = useCallback(
    (fn: (current: TranscriptState) => TranscriptState | null): Promise<boolean> => {
      const run = async () => {
        const current = latest.current;
        const next = current ? fn(current) : null;
        return next ? save(next) : false;
      };
      const p = queue.current.then(run, run);
      queue.current = p.catch(() => undefined);
      return p;
    },
    [save],
  );

  const updateSegment = useCallback(
    (id: string, patch: Partial<Pick<Segment, "text" | "speaker">>) =>
      mutate((cur) => ({
        ...cur,
        segments: cur.segments.map((s) =>
          s.id === id
            ? { ...s, ...patch, flags: s.flags?.includes("edited") ? s.flags : [...(s.flags ?? []), "edited" as const] }
            : s,
        ),
      })),
    [mutate],
  );

  const deleteSegment = useCallback(
    (id: string) => mutate((cur) => ({ ...cur, segments: cur.segments.filter((s) => s.id !== id) })),
    [mutate],
  );

  const renameSpeaker = useCallback(
    (key: string, name: string, role: string | null) =>
      mutate((cur) => ({
        ...cur,
        speakers: cur.speakers.map((s) => (s.key === key ? { ...s, name: name.trim() || s.name, role } : s)),
      })),
    [mutate],
  );

  const mergeSpeakers = useCallback(
    (from: string, into: string) =>
      mutate((cur) =>
        from === into
          ? null
          : {
              ...cur,
              segments: cur.segments.map((s) => (s.speaker === from ? { ...s, speaker: into } : s)),
              speakers: cur.speakers.filter((s) => s.key !== from),
            },
      ),
    [mutate],
  );

  /** Gộp người nói phụ (chưa rõ tên, nói rất ít) thành "Thành viên khác". */
  const consolidateMinor = useCallback(
    () =>
      mutate((cur) => {
        const r = consolidateMinorSpeakers(cur.segments, cur.speakers);
        return r.merged ? { ...cur, segments: r.segments, speakers: r.speakers } : null;
      }),
    [mutate],
  );

  /** Thêm người nói (chỉ cục bộ) — được lưu cùng lần gán câu đầu tiên cho người đó. */
  const addSpeaker = useCallback(
    (name: string): string | null => {
      const cur = latest.current;
      if (!cur) return null;
      let n = cur.speakers.length + 1;
      while (cur.speakers.some((s) => s.key === `S${n}`)) n++;
      const key = `S${n}`;
      commit({ ...cur, speakers: [...cur.speakers, { key, name: name.trim(), role: null }] });
      return key;
    },
    [commit],
  );

  const restoreOriginal = useCallback(
    (original: Segment[]) =>
      mutate((cur) => ({ ...cur, segments: assignIds(original.map(({ id: _id, ...rest }) => rest)) })),
    [mutate],
  );

  return { state, saving, updateSegment, deleteSegment, renameSpeaker, mergeSpeakers, consolidateMinor, addSpeaker, restoreOriginal };
}
