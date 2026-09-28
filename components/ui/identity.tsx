import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/* Mono uppercase label: "CONTINUE LEARNING", "DESIGN · 12 LESSONS". */
export function Eyebrow({
  size = 11,
  className,
  ...props
}: ComponentProps<"span"> & { size?: 11 | 12 }) {
  return (
    <span
      className={cn(
        "font-mono text-ink-soft uppercase",
        size === 11 ? "text-[11px] tracking-[0.1em]" : "text-label tracking-[0.12em]",
        className,
      )}
      {...props}
    />
  );
}

const logoSizes = {
  sm: { mark: "size-[30px] rounded-lg text-[20px]", word: "text-[22px]" },
  md: { mark: "size-8 rounded-[9px] text-[22px]", word: "text-[24px]" },
  lg: { mark: "size-9 rounded-tile text-[24px]", word: "text-[28px]" },
} as const;

/* Terracotta "s" mark + serif wordmark. */
export function Logo({
  size = "md",
  wordmark = true,
  className,
}: {
  size?: keyof typeof logoSizes;
  wordmark?: boolean;
  className?: string;
}) {
  const s = logoSizes[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden={wordmark}
        aria-label={wordmark ? undefined : "Studyhall"}
        className={cn("flex items-center justify-center bg-terracotta font-serif text-cream italic", s.mark)}
      >
        s
      </span>
      {wordmark && <span className={cn("font-serif leading-none", s.word)}>Studyhall</span>}
    </span>
  );
}

function initials(name: string): string {
  return name
    .replace(/^(prof|dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/* Circle avatar: image, or initials on Line. 34–40px. */
export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: 34 | 36 | 40;
  className?: string;
}) {
  const dim = { 34: "size-[34px] text-[12px]", 36: "size-9 text-[13px]", 40: "size-10 text-small" }[size];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar URLs from Clerk; tiny, no optimisation needed
    <img src={src} alt={name} className={cn("shrink-0 rounded-full bg-line object-cover", dim, className)} />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-line font-medium text-ink-soft", dim, className)}
    >
      {initials(name)}
    </span>
  );
}

/* Name + role block (sidebar footer, grading rows). */
export function Person({
  name,
  role,
  src,
  className,
}: {
  name: string;
  role?: ReactNode;
  src?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Avatar name={name} src={src} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-small font-medium">{name}</span>
        {role && <span className="text-[12px] text-ink-soft">{role}</span>}
      </span>
    </span>
  );
}
