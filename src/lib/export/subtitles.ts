import { formatSrtTime } from "@/lib/transcription/timecode";
import { speakerDisplay } from "@/lib/transcription/format";
import type { Segment, Speaker } from "@/lib/transcription/types";

export function toSrt(segments: Segment[], speakers: Speaker[]): string {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(Math.max(s.end, s.start + 0.5))}\n${speakerDisplay(s.speaker, speakers, false)}: ${s.text}\n`,
    )
    .join("\n");
}

export function toVtt(segments: Segment[], speakers: Speaker[]): string {
  const body = segments
    .map(
      (s) =>
        `${formatSrtTime(s.start).replace(",", ".")} --> ${formatSrtTime(Math.max(s.end, s.start + 0.5)).replace(",", ".")}\n<v ${speakerDisplay(s.speaker, speakers, false)}>${s.text}\n`,
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
