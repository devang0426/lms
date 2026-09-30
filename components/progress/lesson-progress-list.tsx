import Link from "next/link";
import { StepIndicator, type StepState } from "@/components/ui";
import type { LessonProgressView, ModuleProgress } from "@/lib/progress/report";
import { cn } from "@/lib/utils/cn";

/* Per-lesson completion (feature 31), by module: the lesson step
   indicator (done = Sage check, started = Terracotta ring, not started =
   empty ring), the title, and how much of a video is watched. The student
   sees their lessons as links; the teacher's report doesn't link (the
   player would record no progress for them anyway). */

const KIND: Record<LessonProgressView["kind"], string> = {
  video: "Video",
  reading: "Reading",
  quiz: "Quiz",
  assignment: "Assignment",
};

const STEP: Record<LessonProgressView["state"], StepState> = { done: "done", started: "current", not_started: "upcoming" };

function detail(l: LessonProgressView): string {
  if (l.state === "done") return "Completed";
  if (l.state === "started") return l.watchedPct === null ? "Started" : `${l.watchedPct}% watched`;
  return "Not started";
}

export function LessonProgressList({
  modules,
  courseId,
  linked,
  headingLevel,
}: {
  modules: ModuleProgress[];
  courseId: string;
  linked: boolean;
  /* The module titles' level under the page's headings. */
  headingLevel: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  if (modules.length === 0) return <p className="m-0 text-small text-ink-soft">No lessons are published yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      {modules.map((m) => (
        <div key={m.moduleId} className="flex flex-col">
          <Heading className="m-0 pb-1 font-mono text-[11px] font-normal tracking-[0.1em] text-ink-soft uppercase">{m.title}</Heading>
          <ul className="m-0 flex list-none flex-col p-0">
            {m.lessons.map((l) => (
              <li key={l.lessonId} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <StepIndicator state={STEP[l.state]} />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  {linked ? (
                    <Link href={`/courses/${courseId}/lessons/${l.lessonId}`} className="truncate text-[15px] text-ink no-underline hover:text-terracotta">
                      {l.title}
                    </Link>
                  ) : (
                    <span className="truncate text-[15px]">{l.title}</span>
                  )}
                  <span className="text-meta text-ink-soft">{KIND[l.kind]}</span>
                </span>
                <span className={cn("shrink-0 text-meta", l.state === "done" ? "text-sage-ink" : "text-ink-soft")}>{detail(l)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
