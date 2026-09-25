"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";
import type { Segment, Speaker } from "@/lib/transcription/types";
import { assignIds } from "@/lib/transcription/merge";
import { stripDiacritics } from "@/lib/utils";

export interface TranscriptState {
  segments: Segment[];
  speakers: Speaker[];
  version: number;
}

/**
 * Quản lý transcript phía client: sửa câu, đổi người nói, đổi tên/gộp người nói.
 * Lưu có kiểm tra phiên bản (optimistic concurrency) để không ghi đè sửa đổi của người khác.
 */
export function useTranscript(recordingId: string, initial: TranscriptState | null, userId: string) {
  const [state, setState] = useState<TranscriptState | null>(initial);
  const [saving, setSaving] = useState(false);
  const versionRef = useRef(initial?.version ?? 1);

  const persist = useCallback(
    async (next: TranscriptState) => {
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
          version: versionRef.current + 1,
          edited_by: userId,
        })
        .eq("recording_id", recordingId)
        .eq("version", versionRef.current)
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
      versionRef.current = data[0].version;
      setState({ ...next, version: data[0].version });
      return true;
    },
    [recordingId, userId],
  );

  const updateSegment = useCallback(
    (id: string, patch: Partial<Pick<Segment, "text" | "speaker">>) => {
      if (!state) return;
      const segments = state.segments.map((s) =>
        s.id === id
          ? { ...s, ...patch, flags: s.flags?.includes("edited") ? s.flags : [...(s.flags ?? []), "edited" as const] }
          : s,
      );
      return persist({ ...state, segments });
    },
    [state, persist],
  );

  const deleteSegment = useCallback(
    (id: string) => {
      if (!state) return;
      return persist({ ...state, segments: state.segments.filter((s) => s.id !== id) });
    },
    [state, persist],
  );

  const renameSpeaker = useCallback(
    (key: string, name: string, role: string | null) => {
      if (!state) return;
      const speakers = state.speakers.map((s) => (s.key === key ? { ...s, name: name.trim() || s.name, role } : s));
      return persist({ ...state, speakers });
    },
    [state, persist],
  );

  const mergeSpeakers = useCallback(
    (from: string, into: string) => {
      if (!state || from === into) return;
      const segments = state.segments.map((s) => (s.speaker === from ? { ...s, speaker: into } : s));
      const speakers = state.speakers.filter((s) => s.key !== from);
      return persist({ ...state, segments, speakers });
    },
    [state, persist],
  );

  const addSpeaker = useCallback(
    (name: string): string | null => {
      if (!state) return null;
      let n = state.speakers.length + 1;
      while (state.speakers.some((s) => s.key === `S${n}`)) n++;
      const key = `S${n}`;
      setState({ ...state, speakers: [...state.speakers, { key, name, role: null }] });
      return key;
    },
    [state],
  );

  const restoreOriginal = useCallback(
    (original: Segment[]) => {
      if (!state) return;
      return persist({ ...state, segments: assignIds(original.map(({ id: _id, ...rest }) => rest)) });
    },
    [state, persist],
  );

  return { state, setState, saving, updateSegment, deleteSegment, renameSpeaker, mergeSpeakers, addSpeaker, restoreOriginal };
}
