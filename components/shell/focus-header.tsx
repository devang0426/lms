import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Icon, ProgressBar } from "@/components/ui";

/* Lesson player header (focus mode, 68px): back, course and module on the
   left; course progress, "7 / 12" and "Mark complete" on the right. The
   page renders it because every value is lesson data. `completeAction` is
   the Mark complete control (feature 12 wires it); without one a disabled
   button is shown. */
export function FocusHeader({
  backHref,
  courseName,
  moduleTitle,
  done,
  total,
  completeAction,
}: {
  backHref: string;
  courseName: string;
  moduleTitle: string;
  done: number;
  total: number;
  completeAction?: ReactNode;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-line bg-paper px-4 md:px-6">
      <span className="flex min-w-0 items-center gap-3">
        <Button asChild variant="icon" size="sm" aria-label="Back to course">
          <Link href={backHref}>
            <Icon icon={ArrowLeft} />
          </Link>
        </Button>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
            {courseName}
          </span>
          <span className="truncate text-[15px] font-medium">{moduleTitle}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <ProgressBar value={pct} className="hidden w-40 md:block" label="Course progress" />
        <span className="hidden font-mono text-meta text-ink-soft sm:inline">
          {done} / {total}
        </span>
        {completeAction ?? (
          <Button variant="success" size="sm" leading={<Icon icon={Check} size={16} />} disabled>
            <span className="hidden sm:inline">Mark complete</span>
            <span className="sm:hidden">Done</span>
          </Button>
        )}
      </span>
    </header>
  );
}
