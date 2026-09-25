import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <g fill="none" stroke="white" strokeWidth="4" strokeLinecap="round">
        <path d="M14 34v-4M22 40V24M30 46V18M38 40V24M46 36v-8" />
      </g>
      <circle cx="51" cy="47" r="7" fill="white" />
      <path d="M48 47h6M51 44v6" className="stroke-primary" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">MeetingAI</div>
        <div className="text-[11px] text-muted-foreground">Phiên âm & tổng hợp họp</div>
      </div>
    </div>
  );
}
