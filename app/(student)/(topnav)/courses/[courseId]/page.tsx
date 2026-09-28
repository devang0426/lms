import { BarChart3, BookOpen, Check, Clock, FileText, ListChecks, ClipboardList, Play, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/course-builder/status-badge";
import {
  Accordion,
  AccordionRow,
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Icon,
  Person,
  StepIndicator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type StepState,
} from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { getCatalogCourse, listCourseInstructors } from "@/lib/db/catalog";
import { getCourseForUser, type ModuleWithLessons } from "@/lib/db/courses";
import { completedLessonIds } from "@/lib/db/progress";
import type { Course, LessonKind } from "@/lib/db/schema";
import { formatLength, plural } from "@/lib/utils/format";

/* Course detail (wireframe 04). Enrolled students (and staff) get the full
   curriculum through getCourseForUser. Anyone else who can see the course
   in the catalog gets its catalog fields only — no lesson titles or links
   — and a note that enrollment is by roster. Everything else is a 404. */

const kindIcons: Record<LessonKind, LucideIcon> = {
  video: Play,
  reading: FileText,
  quiz: ListChecks,
  assignment: ClipboardList,
};

export default async function CourseDetailPage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const user = await requireAreaRole("student", "admin");

  const full = await getCourseForUser(courseId, user);
  const preview = full ? null : await getCatalogCourse(courseId, user);
  if (!full && !preview) notFound();

  const course = (full?.course ?? preview?.course) as Course;
  const modules = full?.modules ?? [];
  const lessonsInOrder = modules.flatMap((m) => m.lessons);
  const lessonCount = full ? lessonsInOrder.length : preview!.lessonCount;
  const durationSec = full
    ? lessonsInOrder.reduce((sum, l) => sum + (l.durationSec ?? 0), 0)
    : preview!.durationSec;
  const instructors = await listCourseInstructors(course.id);
  const lead = instructors.find((i) => i.role === "instructor") ?? instructors[0];

  // The first unfinished lesson is "current"; staff have no progress.
  const completed = full?.access === "student" ? await completedLessonIds(user.id, course.id) : new Set<string>();
  const firstLesson = lessonsInOrder.find((l) => !completed.has(l.id)) ?? lessonsInOrder[0];
  const started = completed.size > 0;
  const firstHref = firstLesson ? `/courses/${course.id}/lessons/${firstLesson.id}` : null;

  return (
    <>
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Eyebrow size={12}>{[course.subject, course.code].filter(Boolean).join(" / ")}</Eyebrow>
          <h1 className="m-0 font-serif text-[44px] leading-none font-normal tracking-[-0.015em] md:text-[64px]">
            {course.title}
          </h1>
          {course.summary && <p className="m-0 max-w-[560px] text-[17px] leading-[1.6] text-ink-soft">{course.summary}</p>}
          {lead && <Person name={lead.name} role={`Course ${lead.role === "ta" ? "TA" : "instructor"}`} src={lead.imageUrl} />}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-soft">
            <Meta icon={BookOpen}>{plural(lessonCount, "lesson")}</Meta>
            {durationSec > 0 && <Meta icon={Clock}>{formatLength(durationSec)}</Meta>}
            {course.level && <Meta icon={BarChart3}>{course.level}</Meta>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {full && firstHref ? (
              <>
                <Button asChild size="xl">
                  <Link href={firstHref}>{started ? "Continue" : "Start course"}</Link>
                </Button>
                <Button asChild variant="secondary" size="xl">
                  <Link href={`/courses/${course.id}/assistant`}>
                    <Icon icon={Sparkles} size={17} />
                    Ask the assistant
                  </Link>
                </Button>
              </>
            ) : full ? (
              <p className="m-0 text-small text-ink-soft">No lessons are published yet. Check back soon.</p>
            ) : (
              <>
                <Badge tone="neutral">Not enrolled</Badge>
                <p className="m-0 max-w-[420px] text-small text-ink-soft">
                  Enrollment is by roster. Ask your instructor or the university admin to add you.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-3xl bg-stripe-clay md:h-[340px]">
          {full && firstLesson && firstHref ? (
            <>
              <Link
                href={firstHref}
                aria-label={`Play ${firstLesson.title}`}
                className="flex size-[72px] items-center justify-center rounded-full bg-paper text-terracotta shadow-raised hover:text-terracotta-hover"
              >
                <Icon icon={Play} size={24} fill="currentColor" />
              </Link>
              <span className="px-6 text-center text-small text-ink-soft">
                {[`Lesson ${lessonsInOrder.indexOf(firstLesson) + 1} · ${firstLesson.title}`, formatLength(firstLesson.durationSec ?? 0)].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span className="font-serif text-[40px] text-clay-ink/70">{course.code}</span>
          )}
        </div>
      </section>

      <Tabs defaultValue="curriculum" className="flex flex-col">
        <TabsList>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="instructor">{instructors.length > 1 ? "Instructors" : "Instructor"}</TabsTrigger>
        </TabsList>

        <TabsContent value="curriculum">
          <div className="grid items-start gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            <div className="flex flex-col gap-2.5">
              {!full ? (
                <Card padded={false} className="border-dashed">
                  <EmptyState
                    title="For enrolled students"
                    description={`${plural(lessonCount, "lesson")} across the term. The full curriculum opens once you're on the roster.`}
                  />
                </Card>
              ) : modules.length === 0 ? (
                <p className="m-0 text-small text-ink-soft">No lessons are published yet.</p>
              ) : (
                modules.map((m, i) => (
                  <ModuleAccordion
                    key={m.id}
                    courseId={course.id}
                    module={m}
                    index={i}
                    staff={full.access === "staff"}
                    stepFor={(id) => (completed.has(id) ? "done" : id === firstLesson?.id ? "current" : "upcoming")}
                    defaultOpen={m.lessons.some((l) => l.id === firstLesson?.id)}
                  />
                ))
              )}
            </div>
            <Outcomes outcomes={course.outcomes} />
          </div>
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid max-w-[900px] gap-6 md:grid-cols-[1.6fr_1fr]">
            <p className="m-0 text-body text-ink">{course.summary || "The instructor hasn't written an overview yet."}</p>
            <dl className="m-0 grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 rounded-card bg-oat p-6 text-small">
              <Fact label="Code" value={course.code} />
              <Fact label="Subject" value={course.subject} />
              <Fact label="Level" value={course.level} />
              <Fact label="Lessons" value={String(lessonCount)} />
              <Fact label="Length" value={formatLength(durationSec)} />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="instructor">
          {instructors.length === 0 ? (
            <p className="m-0 text-small text-ink-soft">No instructor is listed for this course yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {instructors.map((i) => (
                <Person key={i.name} name={i.name} role={i.role === "ta" ? "Teaching assistant" : "Instructor"} src={i.imageUrl} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function Meta({ icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon icon={icon} size={16} />
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">{label}</dt>
      <dd className="m-0">{value}</dd>
    </>
  );
}

function Outcomes({ outcomes }: { outcomes: string[] }) {
  if (outcomes.length === 0) return null;
  return (
    <aside className="flex flex-col gap-3.5 rounded-card bg-oat p-6">
      <h2 className="m-0 text-h3 font-semibold">You&apos;ll be able to</h2>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {outcomes.map((o) => (
          <li key={o} className="flex gap-2.5 text-[15px] leading-[1.45]">
            <Icon icon={Check} strokeWidth={2.2} className="mt-0.5 shrink-0 text-sage" />
            {o}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ModuleAccordion({
  courseId,
  module: m,
  index,
  staff,
  stepFor,
  defaultOpen,
}: {
  courseId: string;
  module: ModuleWithLessons;
  index: number;
  staff: boolean;
  stepFor: (lessonId: string) => StepState;
  defaultOpen: boolean;
}) {
  const length = formatLength(m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0));
  return (
    <Accordion
      index={String(index + 1).padStart(2, "0")}
      title={m.title}
      defaultOpen={defaultOpen}
      meta={
        <>
          {staff && m.status !== "published" && <StatusBadge status={m.status} size="sm" />}
          <span className="hidden sm:inline">{[plural(m.lessons.length, "lesson"), length].filter(Boolean).join(" · ")}</span>
        </>
      }
    >
      {m.lessons.length === 0 ? (
        <AccordionRow title={<span className="text-ink-soft">No lessons yet</span>} />
      ) : (
        m.lessons.map((l) => (
          <AccordionRow
            key={l.id}
            leading={<StepIndicator state={stepFor(l.id)} />}
            title={
              <span className="flex items-center gap-2">
                <Icon icon={kindIcons[l.kind]} size={14} className="shrink-0 text-ink-soft" />
                <Link href={`/courses/${courseId}/lessons/${l.id}`} className="text-ink no-underline hover:text-terracotta">
                  {l.title}
                </Link>
              </span>
            }
            trailing={
              staff && l.status !== "published" ? (
                <StatusBadge status={l.status} size="sm" />
              ) : (
                formatLength(l.durationSec ?? 0) || undefined
              )
            }
          />
        ))
      )}
    </Accordion>
  );
}
