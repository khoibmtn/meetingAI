"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PlayIcon } from "lucide-react";
import { linkifyCitations, parseCiteHref } from "@/lib/citations";
import { cn } from "@/lib/utils";

export interface MarkdownProps {
  children: string;
  className?: string;
  /** Bấm vào trích dẫn [R1 05:23] → gọi hàm này (vd. tua audio). */
  onCite?: (code: string | null, seconds: number) => void;
}

export function Markdown({ children, className, onCite }: MarkdownProps) {
  const source = onCite ? linkifyCitations(children) : children;
  return (
    <div className={cn("prose-app", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children: text, ...rest }) {
            const cite = parseCiteHref(href);
            if (cite && onCite) {
              return (
                <button
                  type="button"
                  onClick={() => onCite(cite.code, cite.seconds)}
                  className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0 align-baseline font-mono text-[0.78em] text-primary no-underline hover:bg-primary/20"
                  title="Nghe đoạn này"
                >
                  <PlayIcon className="size-2.5" />
                  {text}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
                {text}
              </a>
            );
          },
          table({ children: c }) {
            return (
              <div className="overflow-x-auto">
                <table>{c}</table>
              </div>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
