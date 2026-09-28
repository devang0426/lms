import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  CompactCourseCard,
  CourseCard,
  coverClass,
  EmptyState,
  Eyebrow,
  Icon,
  ProgressBar,
} from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatLessonLength } from "@/lib/utils/format";
import {
  courseEyebrow,
  courseProgressLine,
  lessonHref,
  type CourseFilter,
  type StudentCourseView,
} from "./course-view";

function lessonLine(c: StudentCourseView): string {
  if (!c.next) return "";
  return [c.next.moduleTitle, c.next.title, formatLessonLength(c.next.durationSec)].filter(Boolean).join(" · ");
}

/* "Continue learning" hero (wireframe 02). Desktop: Paper card with the
   300×220 cover; below 768px: the Clay-tint "Continue" card (wireframe 07). */
export function ContinueCard({ course: c }: { course: StudentCourseView | null }) {
  if (!c?.next) {
    return (
      <Card className="rounded-3xl">
        <EmptyState
          title={<>Nothing to <em>pick up</em> yet</>}
          description="When one of your courses publishes its first lesson, it'll be waiting for you here."
          action={
            <Button asChild variant="secondary" size="md">
              <Link href="/catalog">Explore the catalog</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  const href = lessonHref(c.course.id, c.next.lessonId);
  const started = c.completedLessons > 0 || c.lastWatchedAt !== null;
  const resumeLabel = started ? "Resume lesson" : "Start lesson";

  return (
    <>
      <section className="hidden gap-7 rounded-3xl border border-line bg-paper p-6 md:flex">
        <Link
          href={href}
          aria-label={`Play ${c.next.title}`}
          className={cn(
            "hidden h-[220px] w-[240px] shrink-0 items-center justify-center rounded-2xl lg:flex xl:w-[300px]",
            coverClass[c.course.coverTint],
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-paper text-terracotta shadow-hairline">
            <Icon icon={Play} size={20} fill="currentColor" />
          </span>
        </Link>
        <div className="flex min-w-0 grow flex-col gap-3.5">
          <Eyebrow size={12}>Continue learning</Eyebrow>
          <h2 className="m-0 font-serif text-[34px] leading-[1.1] font-normal">{c.course.title}</h2>
          <span className="text-[15px] text-ink-soft">{lessonLine(c)}</span>
          <div className="mt-auto flex flex-col gap-2">
            <ProgressBar value={c.percent} size={8} label={`${c.course.title} progress`} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-meta text-ink-soft">{c.percent}% complete</span>
              <Button asChild size="md">
                <Link href={href}>
                  {resumeLabel}
                  <Icon icon={ArrowRight} size={16} strokeWidth={2} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[22px] bg-clay p-[18px] md:hidden">
        <Eyebrow className="text-clay-ink">Continue</Eyebrow>
        <h2 className="m-0 font-serif text-[28px] leading-[1.1] font-normal">{c.course.title}</h2>
        <span className="text-small text-ink-soft">{lessonLine(c)}</span>
        <ProgressBar value={c.percent} trackClassName="bg-paper/70" label={`${c.course.title} progress`} />
        <Button asChild className="w-full">
          <Link href={href}>
            <Icon icon={Play} size={14} fill="currentColor" />
            {started ? "Resume" : "Start"}
          </Link>
        </Button>
      </section>
    </>
  );
}

/* "Coming up" (wireframe 02). Deadlines and events arrive with feature 21. */
export function ComingUpCard() {
  return (
    <Card className="w-full gap-3.5 rounded-3xl">
      <CardHeader title="Coming up" action={<Link href="/calendar" className="text-small">Calendar</Link>} />
      <div className="flex grow flex-col justify-center gap-1 py-4 text-center">
        <span className="font-serif text-[22px] leading-[1.2]">A clear week</span>
        <span className="text-meta text-ink-soft">Deadlines and live sessions will show up here.</span>
      </div>
    </Card>
  );
}

/* In progress / Completed chips, driven by ?show= so the back button works. */
export function CourseFilterChips({ basePath, active }: { basePath: string; active: CourseFilter }) {
  const chips: { value: CourseFilter; label: string }[] = [
    { value: "in-progress", label: "In progress" },
    { value: "completed", label: "Completed" },
  ];
  return (
    <div className="flex gap-2" role="group" aria-label="Filter courses">
      {chips.map((chip) => (
        <Chip key={chip.value} asChild active={chip.value === active} className="h-[34px] px-3.5">
          <Link
            href={chip.value === "in-progress" ? basePath : `${basePath}?show=${chip.value}`}
            aria-current={chip.value === active ? "true" : undefined}
            scroll={false}
          >
            {chip.label}
          </Link>
        </Chip>
      ))}
    </div>
  );
}

export function CourseGrid({ courses, empty }: { courses: StudentCourseView[]; empty: ReactNode }) {
  if (courses.length === 0) {
    return <div className="rounded-card border border-dashed border-line bg-paper">{empty}</div>;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map((c) => (
        <CourseCard
          key={c.course.id}
          href={`/courses/${c.course.id}`}
          title={c.course.title}
          eyebrow={courseEyebrow(c)}
          cover={c.course.coverTint}
          progress={c.percent}
          meta={courseProgressLine(c)}
        />
      ))}
    </div>
  );
}

/* Mobile "Your courses" list (wireframe 07). */
export function CompactCourseList({ courses }: { courses: StudentCourseView[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {courses.map((c) => (
        <CompactCourseCard
          key={c.course.id}
          href={`/courses/${c.course.id}`}
          title={c.course.title}
          cover={c.course.coverTint}
          progress={c.percent}
        />
      ))}
    </div>
  );
}
