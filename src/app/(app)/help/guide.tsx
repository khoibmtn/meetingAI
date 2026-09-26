import Link from "next/link";
import { ArrowUpRightIcon, ChevronDownIcon, InfoIcon, LightbulbIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  label: string;
  children?: TocItem[];
}

/** Khoảng chừa khi nhảy tới mục (thanh trên cùng trên điện thoại cao 3.5rem). */
const ANCHOR = "scroll-mt-20 lg:scroll-mt-6";

/** Một trang (hoặc một chủ đề) của ứng dụng trong hướng dẫn. */
export function GuideSection({
  id,
  icon: Icon,
  title,
  where,
  href,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  /** Cách mở trang này. */
  where?: React.ReactNode;
  /** Liên kết mở trang thật. */
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("rounded-xl border bg-card p-4 shadow-xs sm:p-6", ANCHOR)}>
      <header className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id={`${id}-title`} className="text-lg leading-tight font-semibold tracking-tight sm:text-xl">
            {title}
          </h2>
          {where ? <p className="text-sm text-muted-foreground">{where}</p> : null}
        </div>
        {href ? (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href={href}>
              <span className="max-sm:sr-only">Mở trang</span> <ArrowUpRightIcon />
            </Link>
          </Button>
        ) : null}
      </header>
      <div className="space-y-6 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Một nhóm nội dung trong mục: "Trên trang có gì", "Cách làm"… */
export function Topic({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className={cn("space-y-2", id && ANCHOR)}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** Tên một thao tác nhỏ trong "Cách làm". */
export function Task({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>;
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary">{children}</ol>;
}

/**
 * Tên nút / nhãn đúng như trên giao diện. Không có chữ → chỉ hiện biểu tượng (nút chỉ có biểu tượng),
 * `label` dùng cho trình đọc màn hình.
 */
export function Ui({ children, icon: Icon, label }: { children?: React.ReactNode; icon?: LucideIcon; label?: string }) {
  return (
    <span
      className="rounded-md border bg-muted/60 px-1.5 py-0.5 text-[0.86em] font-medium text-foreground [box-decoration-break:clone]"
      aria-label={children ? undefined : label}
      title={children ? undefined : label}
    >
      {Icon ? <Icon aria-hidden className={cn("inline size-3.5 -translate-y-px align-middle", children ? "mr-1" : "")} /> : null}
      {children}
    </span>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] break-words">{children}</code>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-muted px-1 font-mono text-[0.8em]">{children}</kbd>;
}

const TONES = {
  tip: { icon: LightbulbIcon, box: "border-primary/30 bg-primary/5", tint: "text-primary", title: "Mẹo" },
  warn: { icon: TriangleAlertIcon, box: "border-warning/50 bg-warning/10", tint: "text-warning", title: "Lưu ý" },
  info: { icon: InfoIcon, box: "bg-muted/40", tint: "text-muted-foreground", title: null },
} as const;

export function Callout({ tone = "tip", title, children }: { tone?: keyof typeof TONES; title?: string; children: React.ReactNode }) {
  const t = TONES[tone];
  const heading = title ?? t.title;
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3 text-sm", t.box)}>
      <t.icon className={cn("mt-0.5 size-4 shrink-0", t.tint)} />
      <div className="min-w-0 space-y-1">
        {heading ? <p className="font-medium">{heading}</p> : null}
        <div className="text-muted-foreground [&_b]:text-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Danh sách "tên — giải thích" (thay cho bảng để không tràn ngang trên điện thoại). */
export function DefList({ items }: { items: { term: React.ReactNode; desc: React.ReactNode }[] }) {
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {items.map((i, idx) => (
        <div key={idx} className="grid gap-1 p-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
          <dt className="font-medium">{i.term}</dt>
          <dd className="text-muted-foreground [&_b]:text-foreground">{i.desc}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Câu hỏi thường gặp: bấm để mở câu trả lời. */
export function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border px-3 py-2.5 open:bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="pt-2 text-sm text-muted-foreground [&_b]:text-foreground">{children}</div>
    </details>
  );
}

/** Mục lục: bên phải trên màn hình rộng, dạng lưới ở đầu trang trên điện thoại. */
export function Toc({ items, className }: { items: TocItem[]; className?: string }) {
  return (
    <nav aria-label="Mục lục" className={className}>
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Mục lục</p>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              {i.label}
            </a>
            {i.children?.length ? (
              <ul className="mb-1 ml-2 space-y-0.5 border-l pl-2 text-[13px]">
                {i.children.map((c) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="block rounded px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                      {c.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileToc({ items }: { items: TocItem[] }) {
  return (
    <nav aria-label="Mục lục" className="rounded-xl border bg-card p-4 lg:hidden">
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Mục lục</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i.id} className="min-w-0">
            <a href={`#${i.id}`} className="block text-primary underline-offset-4 hover:underline">
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
