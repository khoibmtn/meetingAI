import { formatTimecode } from "./timecode";
import { defaultSpeakerName } from "./speakers";
import type { Segment, Speaker } from "./types";

export function speakerDisplay(key: string, speakers: Speaker[], withRole = true): string {
  const s = speakers.find((x) => x.key === key);
  const name = s?.name?.trim() || defaultSpeakerName(key);
  return withRole && s?.role ? `${name} (${s.role})` : name;
}

export interface Turn {
  speaker: string;
  start: number;
  end: number;
  segmentIds: string[];
  text: string;
}

/** Gộp các câu liên tiếp của cùng người nói thành một lượt lời (tiết kiệm token, dễ đọc). */
export function toTurns(segments: Segment[], maxGapSec = 4, maxTurnSec = 120): Turn[] {
  const turns: Turn[] = [];
  for (const s of segments) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === s.speaker && s.start - last.end <= maxGapSec && s.end - last.start <= maxTurnSec) {
      last.text += ` ${s.text}`;
      last.end = Math.max(last.end, s.end);
      last.segmentIds.push(s.id);
    } else {
      turns.push({ speaker: s.speaker, start: s.start, end: s.end, segmentIds: [s.id], text: s.text });
    }
  }
  return turns;
}

/** Định dạng transcript cho mô hình: "[05:23] BS. Quang (Người trình bày): …" */
export function formatTranscriptForLLM(
  segments: Segment[],
  speakers: Speaker[],
  opts: { prefix?: string } = {},
): string {
  return toTurns(segments)
    .map((t) => `[${opts.prefix ?? ""}${formatTimecode(t.start)}] ${speakerDisplay(t.speaker, speakers)}: ${t.text}`)
    .join("\n");
}

/** Xuất văn bản thuần: tên người nói + thời gian + nội dung. */
export function formatTranscriptText(segments: Segment[], speakers: Speaker[]): string {
  return toTurns(segments)
    .map((t) => `[${formatTimecode(t.start)}] ${speakerDisplay(t.speaker, speakers)}:\n${t.text}`)
    .join("\n\n");
}

export function formatTranscriptMarkdown(title: string, segments: Segment[], speakers: Speaker[]): string {
  const lines = [`# ${title}`, "", `**Người nói:** ${speakers.map((s) => speakerDisplay(s.key, speakers)).join("; ")}`, ""];
  for (const t of toTurns(segments)) {
    lines.push(`**[${formatTimecode(t.start)}] ${speakerDisplay(t.speaker, speakers)}:** ${t.text}`, "");
  }
  return lines.join("\n");
}
