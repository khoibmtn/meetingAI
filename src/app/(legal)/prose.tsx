import { LEGAL_UPDATED } from "./org";

export function LegalDoc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="space-y-8 text-[15px] leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Cập nhật lần cuối: {LEGAL_UPDATED}</p>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>;
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </a>
  );
}

export function Contact({ email }: { email: string | null }) {
  return email ? (
    <ExternalLink href={`mailto:${email}`}>{email}</ExternalLink>
  ) : (
    <>quản trị viên hệ thống của đơn vị</>
  );
}
