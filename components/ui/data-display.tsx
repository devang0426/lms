import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

/* Date tile: month over a serif day. butter = due soon, oat = default,
   paper = on a butter notice (mobile). */
export function DateTile({
  month,
  day,
  tone = "oat",
  size = "md",
  className,
}: {
  month: string;
  day: string | number;
  tone?: "butter" | "oat" | "paper";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center",
        size === "md" ? "h-[52px] w-12 rounded-xl" : "h-[46px] w-11 rounded-tile",
        { butter: "bg-butter-tint", oat: "bg-oat", paper: "bg-paper" }[tone],
        className,
      )}
    >
      <span className={cn("uppercase", size === "md" ? "text-[11px]" : "text-[10px]", tone === "oat" ? "text-ink-soft" : "text-butter-ink")}>
        {month}
      </span>
      <span className={cn("font-serif leading-none", size === "md" ? "text-[22px]" : "text-[20px]")}>
        {String(day).padStart(2, "0")}
      </span>
    </div>
  );
}

/* Instructor dashboard stat. `attention` = butter card for things waiting. */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = "muted",
  attention = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: "success" | "muted";
  attention?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-card p-5",
        attention ? "bg-butter-tint" : "border border-line bg-paper",
        className,
      )}
    >
      <span className={cn("text-small", attention ? "text-butter-ink" : "text-ink-soft")}>{label}</span>
      <span className="font-serif text-h1 leading-none">{value}</span>
      {delta && (
        <span
          className={cn(
            "text-meta",
            attention ? "text-butter-ink" : deltaTone === "success" ? "text-sage-ink" : "text-ink-soft",
          )}
        >
          {delta}
        </span>
      )}
    </div>
  );
}

/* Leading visual + title/subtitle + trailing meta, with a Line divider. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  divider = true,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 py-3", divider && "border-b border-line", className)}>
      {leading}
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{title}</span>
        {subtitle && <span className="truncate text-meta text-ink-soft">{subtitle}</span>}
      </div>
      {trailing && <span className="shrink-0 text-[12px] text-ink-soft">{trailing}</span>}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  /* grid fraction, e.g. "2.4fr" */
  width?: string;
  cell: (row: T) => ReactNode;
}

/* Grid table: Oat header with mono labels, Line-divided rows. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}) {
  const template = columns.map((c) => c.width ?? "1fr").join(" ");
  return (
    <div role="table" className={cn("flex flex-col", className)}>
      <div
        role="row"
        className="grid gap-4 bg-oat px-[22px] py-2.5 font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => (
          <span key={c.key} role="columnheader">
            {c.header}
          </span>
        ))}
      </div>
      {rows.length === 0 && empty ? (
        <div className="px-[22px] py-8 text-center text-small text-ink-soft">{empty}</div>
      ) : (
        rows.map((row, i) => (
          <div
            key={rowKey(row)}
            role="row"
            className={cn("grid items-center gap-4 px-[22px] py-4 text-small", i < rows.length - 1 && "border-b border-line")}
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((c) => (
              <span key={c.key} role="cell" className="min-w-0">
                {c.cell(row)}
              </span>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/* Curriculum module (native <details>: accessible, no JS). */
export function Accordion({
  index,
  title,
  meta,
  defaultOpen = false,
  children,
  className,
}: {
  index?: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group overflow-hidden rounded-2xl border border-line bg-paper", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3.5">
          {index && <span className="font-mono text-label text-ink-soft">{index}</span>}
          <span className="text-[16px] font-semibold">{title}</span>
        </span>
        <span className="flex items-center gap-3 text-meta text-ink-soft">
          {meta}
          <Icon icon={ChevronDown} size={16} className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {children && <div className="flex flex-col border-t border-line px-5 py-1.5">{children}</div>}
    </details>
  );
}

/* A lesson line inside an Accordion. */
export function AccordionRow({
  leading,
  title,
  trailing,
}: {
  leading?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 pl-[34px] text-small">
      <span className="flex items-center gap-2.5">
        {leading}
        {title}
      </span>
      {trailing && <span className="shrink-0 text-ink-soft">{trailing}</span>}
    </div>
  );
}

/* Empty state: a serif line, muted text and one action. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <p className="m-0 font-serif text-[28px] leading-[1.15]">{title}</p>
      {description && <p className="m-0 max-w-[420px] text-small text-ink-soft">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
