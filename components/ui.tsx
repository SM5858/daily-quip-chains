import type { ReactNode } from "react";

/** One source of truth for form control styling, shared by every form. */
export const inputClass =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-5 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-accent",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Model output and prompt text: preserve the newlines the model sent. */
export function Pre({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed ${className}`}
    >
      {children}
    </pre>
  );
}

export function Duration({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return (
    <span className="tabular-nums">
      {ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}
    </span>
  );
}
