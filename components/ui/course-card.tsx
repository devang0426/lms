import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "./badge";
import { Eyebrow } from "./identity";
import { ProgressBar } from "./progress";

export type CoverTint = "clay" | "sage" | "butter" | "stripe";

export const coverClass: Record<CoverTint, string> = {
  clay: "bg-clay",
  sage: "bg-sage-tint",
  butter: "bg-butter-tint",
  stripe: "bg-stripe",
};

interface CourseCardProps {
  href: string;
  title: string;
  /* Mono eyebrow, e.g. "DESIGN · 12 LESSONS" */
  eyebrow?: string;
  cover?: CoverTint;
  /* 0–100; shown on `enrolled` and `compact` */
  progress?: number;
  /* 13px muted line, e.g. "62% · 5 lessons left" or "[Instructor] · 12 lessons" */
  meta?: ReactNode;
  /* e.g. "New" on catalog covers */
  badge?: string;
  className?: string;
}

/* Enrolled course (Student home grid): bordered card, 110px cover. */
export function CourseCard({
  href,
  title,
  eyebrow,
  cover = "stripe",
  progress,
  meta,
  className,
}: CourseCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col overflow-hidden rounded-card border border-line bg-paper text-ink no-underline transition-shadow hover:text-ink hover:shadow-raised",
        className,
      )}
    >
      <div className={cn("h-[110px]", coverClass[cover])} />
      <div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <span className="font-serif text-[24px] leading-[1.1]">{title}</span>
        {progress !== undefined && <ProgressBar value={progress} label={`${title} progress`} />}
        {meta && <span className="text-meta text-ink-soft">{meta}</span>}
      </div>
    </Link>
  );
}

/* Catalog tile: borderless, 150px rounded cover with an optional badge. */
export function CatalogCard({
  href,
  title,
  eyebrow,
  cover = "stripe",
  meta,
  badge,
  className,
}: CourseCardProps) {
  return (
    <Link href={href} className={cn("group flex flex-col gap-3 text-ink no-underline hover:text-ink", className)}>
      <div className={cn("relative h-[150px] rounded-[18px] transition-transform group-hover:-translate-y-0.5", coverClass[cover])}>
        {badge && (
          <Badge tone="onImage" size="md" className="absolute top-3 left-3">
            {badge}
          </Badge>
        )}
      </div>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <span className="font-serif text-[24px] leading-[1.1]">{title}</span>
      {meta && <span className="text-meta text-ink-soft">{meta}</span>}
    </Link>
  );
}

/* Mobile list row: 56px tint tile, title, 5px bar, mono percentage. */
export function CompactCourseCard({
  href,
  title,
  cover = "stripe",
  progress = 0,
  className,
}: CourseCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3.5 rounded-2xl border border-line bg-paper p-3 text-ink no-underline hover:text-ink",
        className,
      )}
    >
      <div className={cn("size-14 shrink-0 rounded-xl", coverClass[cover])} />
      <div className="flex grow flex-col gap-1.5">
        <span className="text-[15px] font-medium">{title}</span>
        <ProgressBar value={progress} size={5} label={`${title} progress`} />
      </div>
      <span className="font-mono text-label text-ink-soft">{Math.round(progress)}%</span>
    </Link>
  );
}
