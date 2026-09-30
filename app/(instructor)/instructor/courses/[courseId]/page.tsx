import { Eye, Table2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourseDetailsForm, PublishCourseButton, PublishCourseWithModulesButton } from "@/components/course-builder/course-settings";
import { CurriculumEditor } from "@/components/course-builder/curriculum-editor";
import { DeleteCourseSection } from "@/components/course-builder/delete-course";
import { SetupChecklist } from "@/components/course-builder/setup-checklist";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { CourseLearnersCard } from "@/components/learners/course-learners";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, Icon, SkeletonCard, SkeletonRegion, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CourseEventsEditor } from "@/components/calendar/course-events-editor";
import { requireUser } from "@/lib/auth";
import { setupComplete, setupSteps } from "@/lib/courses/setup";
import { loadCourseBuilder } from "@/lib/db/builder-page";
import { courseLearners } from "@/lib/db/learners";
import type { CourseLearners } from "@/lib/progress/learners";
import { requestTime } from "@/lib/utils/clock";

const TABS = ["curriculum", "students", "calendar", "details"] as const;
const NO_FACTS = { readyVideo: false, empty: false, drafts: { notes: 0, cards: 0, questions: 0 } };

export default async function CourseBuilderPage({ params, searchParams }: PageProps<"/instructor/courses/[courseId]">) {
  const { courseId } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  // One batch with its own staff check (feature 29). The Calendar tab
  // (feature 21) lists events from the start of today, UTC.
  const loaded = await loadCourseBuilder(courseId, user, new Date(Math.floor(requestTime() / 86_400_000) * 86_400_000));
  if (!loaded) notFound();
  const { data, upcoming, facts, setup } = loaded;
  // The Students tab (feature 31) reads in a second batch, sent once the
  // page's has returned, and streams in behind its own Suspense boundary.
  const now = requestTime();
  const learners = early(courseLearners(courseId, user, new Date(now)));
  const { course } = data;
  const modules = data.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, facts: facts.get(l.id) ?? NO_FACTS })) }));
  // "Get your course live" (feature 27) until every step is done.
  const steps = setup ? setupSteps(setup, { canEnroll: user.role === "admin" }) : [];
  const openTab = TABS.find((t) => t === tab) ?? "curriculum";

  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);
  const visible = modules
    .filter((m) => m.status === "published")
    .reduce((n, m) => n + m.lessons.filter((l) => l.status === "published").length, 0);

  return (
    <>
      <Breadcrumbs items={[{ label: "Courses", href: "/instructor/courses" }, { label: course.code }]} />
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            {course.code}
            <StatusBadge status={course.status} size="sm" />
          </span>
        }
        title={course.title}
        actions={
          <>
            {/* asChild renders only the link, so icons go inside it (feature 28). */}
            <Button asChild variant="quiet" size="sm">
              <Link href={`/courses/${course.id}`}>
                <Icon icon={Eye} size={16} />
                View as student
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/instructor/courses/${course.id}/gradebook`}>
                <Icon icon={Table2} size={16} />
                Gradebook
              </Link>
            </Button>
            <PublishCourseButton courseId={course.id} published={course.status === "published"} />
          </>
        }
      />

      {steps.length > 0 && !setupComplete(steps) && <SetupChecklist courseId={course.id} steps={steps} here={`/instructor/courses/${course.id}`} />}

      {course.status === "published" ? (
        <p className="m-0 rounded-2xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
          Enrolled students can see {visible} of {lessonCount} lessons. A lesson shows once it and its module are published.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
          <p className="m-0">This course is a draft, so students can&apos;t see any of it yet. Publish the course, its modules and its lessons.</p>
          <PublishCourseWithModulesButton courseId={course.id} />
        </div>
      )}

      <Tabs key={openTab} defaultValue={openTab} className="flex flex-col">
        <TabsList>
          <TabsTrigger value="curriculum" count={modules.length}>
            Curriculum
          </TabsTrigger>
          <TabsTrigger value="students" count={setup?.students || undefined}>
            Students
          </TabsTrigger>
          <TabsTrigger value="calendar" count={upcoming.length || undefined}>
            Calendar
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="curriculum">
          <CurriculumEditor courseId={course.id} modules={modules} />
        </TabsContent>
        <TabsContent value="students">
          <Suspense fallback={<StudentsLoading />}>
            <StudentsTab pending={learners} now={now} />
          </Suspense>
        </TabsContent>
        <TabsContent value="calendar">
          <CourseEventsEditor courseId={course.id} events={upcoming} />
        </TabsContent>
        <TabsContent value="details">
          <div className="flex flex-col gap-6">
            <Card>
              <CourseDetailsForm course={course} />
            </Card>
            {/* Feature 35: asks the server only when its dialog opens. */}
            <DeleteCourseSection courseId={course.id} code={course.code} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function StudentsTab({ pending, now }: { pending: Promise<CourseLearners | null>; now: number }) {
  const data = await pending;
  return data && <CourseLearnersCard data={data} now={now} withCourse={false} />;
}

function StudentsLoading() {
  return (
    <SkeletonRegion>
      <SkeletonCard lines={4} />
    </SkeletonRegion>
  );
}

/* Started before the page renders and awaited inside a Suspense boundary.
   Marked as handled here, so a failure while the page is still rendering
   isn't an unhandled rejection; the tab that awaits it still throws. */
function early<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}
