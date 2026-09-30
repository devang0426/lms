import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { Button, Card, Eyebrow, Icon } from "@/components/ui";
import { dueLabel } from "@/lib/coursework/rules";
import { nextUpHref, type NextUp } from "@/lib/progress/next-up";
import { formatTime } from "@/lib/time";

/* "Next up" on /progress (feature 31): one suggestion across the
   student's courses (lib/progress/next-up.ts), with the page's one
   Terracotta action. Work due soon is a Butter card: it needs attention. */
export function NextUpCard({ next, now }: { next: NextUp; now: number }) {
  if (next.kind === "done") {
    return (
      <Card variant="sunken" className="gap-1.5">
        <Eyebrow>Next up</Eyebrow>
        <h2 className="m-0 font-serif text-[26px] leading-[1.15] font-normal">You&apos;re all caught up</h2>
        <p className="m-0 text-small text-ink-soft">
          Nothing is due in the next three days, every lesson is finished and no quiz topic is below 50%. A few flashcards keep it fresh.
        </p>
      </Card>
    );
  }

  const { title, meta, action } = copy(next, now);
  return (
    <Card variant={next.kind === "work" ? "attention" : "flat"} className="flex-row flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Eyebrow className={next.kind === "work" ? "text-butter-ink" : undefined}>Next up</Eyebrow>
        <h2 className="m-0 font-serif text-[26px] leading-[1.15] font-normal">{title}</h2>
        <p className={next.kind === "work" ? "m-0 text-small text-butter-ink" : "m-0 text-small text-ink-soft"}>{meta}</p>
      </div>
      <Button asChild size="md">
        <Link href={nextUpHref(next)}>
          {next.kind === "review" && next.startSec !== null && <Icon icon={Play} size={16} />}
          {action}
          {next.kind !== "review" && <Icon icon={ArrowRight} size={16} />}
        </Link>
      </Button>
    </Card>
  );
}

function copy(next: Exclude<NextUp, { kind: "done" }>, now: number): { title: string; meta: string; action: string } {
  switch (next.kind) {
    case "work":
      return {
        title: next.work === "quiz" ? `Take ${next.title}` : `Hand in ${next.title}`,
        meta: `${next.code} · ${dueLabel(next.dueAt.getTime(), now)}`,
        action: next.work === "quiz" ? "Open the quiz" : "Open the assignment",
      };
    case "lesson":
      return { title: next.title, meta: `${next.code} · ${next.moduleTitle}`, action: "Continue" };
    case "review":
      return {
        title: `Review ${next.topic}`,
        meta: `${next.code} · ${next.pct}% of your quiz answers on it are right so far`,
        action: next.startSec === null ? "Open the lesson" : `Watch from ${formatTime(next.startSec)}`,
      };
    default: {
      const never: never = next;
      return never;
    }
  }
}
