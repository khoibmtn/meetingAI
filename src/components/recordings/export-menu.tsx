"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadBlob, safeFilename } from "@/lib/client/api";
import { formatTranscriptMarkdown, formatTranscriptText } from "@/lib/transcription/format";
import { toSrt, toVtt } from "@/lib/export/subtitles";
import type { Segment, Speaker } from "@/lib/transcription/types";

export function ExportMenu({ title, segments, speakers }: { title: string; segments: Segment[]; speakers: Speaker[] }) {
  const base = safeFilename(title);
  async function docx() {
    const { markdownToDocxBlob } = await import("@/lib/export/docx");
    downloadBlob(await markdownToDocxBlob(formatTranscriptMarkdown(title, segments, speakers), title), `${base} - transcript.docx`);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!segments.length}>
          <DownloadIcon /> Xuất
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Xuất transcript</DropdownMenuLabel>
        <DropdownMenuItem onSelect={docx}>Word (.docx)</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => downloadBlob(new Blob([formatTranscriptMarkdown(title, segments, speakers)], { type: "text/markdown" }), `${base}.md`)}
        >
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadBlob(new Blob([formatTranscriptText(segments, speakers)], { type: "text/plain" }), `${base}.txt`)}>
          Văn bản (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadBlob(new Blob([toSrt(segments, speakers)], { type: "application/x-subrip" }), `${base}.srt`)}>
          Phụ đề (.srt)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadBlob(new Blob([toVtt(segments, speakers)], { type: "text/vtt" }), `${base}.vtt`)}>
          Phụ đề web (.vtt)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
