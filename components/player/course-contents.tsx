import Link from "next/link";
import { Eyebrow, StepIndicator, type StepState } from "@/components/ui";
import type { ModuleWithLessons } from "@/lib/db/courses";
import { cn } from "@/lib/utils/cn";
import { formatLessonLength } from "@/lib/utils/format";

/* Course contents beside the player (wireframe 05): 380px Oat panel,
   lessons grouped by module with step indicators, the current lesson
   lifted onto Paper. Below 1024px it follows the main column. */
export function CourseContents({
  courseId,
  modules,
  currentLessonId,
  completed,
}: {
  courseId: string;
  modules: ModuleWithLessons[];
  currentLessonId: string;
  completed: Set<string>;
}) {
  const lessons = modules.flatMap((m) => m.lessons);
  const done = lessons.filter((l) => completed.has(l.id)).length;
  const stepFor = (id: string): StepState =>
    completed.has(id) ? "done" : id === currentLessonId ? "current" : "upcoming";

  return (
    <aside
      aria-label="Course contents"
      className="flex shrink-0 flex-col gap-6 border-t border-line bg-oat px-5 py-7 lg:w-[380px] lg:border-t-0 lg:border-l lg:px-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-h3 font-semibold">Course contents</h2>
        <span className="font-mono text-meta text-ink-soft">
          {done} / {lessons.length} done
        </span>
      </div>
      {modules.map((m, i) => (
        <section key={m.id} aria-labelledby={`module-${m.id}`} className="flex flex-col gap-1.5">
          <Eyebrow id={`module-${m.id}`} className="px-3 pb-1">
            {String(i + 1).padStart(2, "0")} · {m.title}
          </Eyebrow>
          {m.lessons.length === 0 ? (
            <p className="m-0 px-3 text-meta text-ink-soft">No lessons yet</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
              {m.lessons.map((l) => {
                const current = l.id === currentLessonId;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/courses/${courseId}/lessons/${l.id}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-ink no-underline hover:bg-paper/60 hover:text-ink",
                        current && "bg-paper font-medium shadow-hairline hover:bg-paper",
                      )}
                    >
                      <StepIndicator state={stepFor(l.id)} />
                      <span className="min-w-0 grow">{l.title}</span>
                      <span className="shrink-0 font-mono text-[12px] text-ink-soft">{formatLessonLength(l.durationSec)}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </aside>
  );
}
