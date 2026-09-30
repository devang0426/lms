import { Play } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import type { CourseTopicMastery } from "@/lib/progress/report";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils/cn";

/* Quiz mastery per topic across a course (feature 31), weakest first:
   the Quiz tab's bars (feature 16: Sage from 80%, Butter from 50%,
   terracotta/55 below) for every topic the student has answered. On the
   student's own page a weak topic links to where it's taught. */

const FILL = { sage: "bg-sage", butter: "bg-butter", clay: "bg-terracotta/55" } as const;

export function TopicMastery({
  topics,
  untried,
  courseId,
  linked,
  empty,
}: {
  topics: CourseTopicMastery[];
  /* Topics with questions the student hasn't answered yet. */
  untried: number;
  courseId: string;
  linked: boolean;
  empty: string;
}) {
  if (topics.length === 0) return <p className="m-0 text-small text-ink-soft">{empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {topics.map((t) => (
          <li key={t.topic} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-small">
              <span className="font-medium">{t.topic}</span>
              <span className="flex items-center gap-2">
                {linked && t.tone === "clay" && t.startSec !== null && (
                  <Link
                    href={`/courses/${courseId}/lessons/${t.lessonId}?t=${Math.floor(t.startSec)}`}
                    className="inline-flex h-6 items-center gap-1 rounded-full bg-clay px-2.5 font-mono text-[12px] text-clay-ink no-underline hover:bg-clay-stripe hover:text-clay-ink"
                  >
                    <Icon icon={Play} size={10} fill="currentColor" />
                    Review in video · {formatTime(t.startSec)}
                  </Link>
                )}
                <span className="font-mono text-meta text-ink-soft">
                  {t.pct}% · {t.correct}/{t.total}
                </span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${t.topic} mastery`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={t.pct}
              className="h-1.5 w-full overflow-hidden rounded-full bg-oat"
            >
              <div className={cn("h-1.5 rounded-full", FILL[t.tone])} style={{ width: `${Math.max(t.pct, 3)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {untried > 0 && (
        <p className="m-0 text-meta text-ink-soft">
          {untried} more {untried === 1 ? "topic" : "topics"} not tried yet.
        </p>
      )}
    </div>
  );
}
