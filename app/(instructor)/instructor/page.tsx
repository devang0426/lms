import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PostAnnouncementDialog } from "@/components/announcements/post-announcement-dialog";
import { SetupChecklist } from "@/components/course-builder/setup-checklist";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { LocalDate } from "@/components/coursework/local-date";
import { DiscussionList } from "@/components/discussions/discussion-list";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Eyebrow, Icon, ProgressBar, Skeleton, SkeletonCard, SkeletonText, StatCard } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { setupComplete, setupSteps } from "@/lib/courses/setup";
import { courseCompletion, overallCompletion, waitedFor } from "@/lib/dashboard/stats";
import { loadDashboard } from "@/lib/db/dashboard";
import { gradingQueue, type QueueItem } from "@/lib/db/grades";
import { requestTime } from "@/lib/utils/clock";
import { plural } from "@/lib/utils/format";

export const metadata = { title: "Overview · Studyhall" };

/* Instructor overview (wireframe 06, feature 22): stat cards, the courses
   table and the "Needs grading" list, plus feature 21's "Post
   announcement" and unanswered questions, and feature 27's "Get your
   course live" checklist. Every number is scoped to the courses this
   viewer teaches (admins: all), in the SQL. */

const SHOWN = 5;
const WEEK_MS = 7 * 86_400_000;

export default async function InstructorOverviewPage() {
  const user = await requireAreaRole("instructor", "admin");
  const name = user.name.replace(/^(prof|dr)\.?\s+/i, "").split(/\s+/)[0];
  const now = requestTime();
  // One batch; then the grading list, which streams in behind its own
  // Suspense boundaries (feature 29).
  const { data, questions, setups } = await loadDashboard(user, new Date(now - WEEK_MS), SHOWN);
  const queue = gradingQueue(user);
  // "Get your course live" (feature 27) for the newest course of theirs that isn't yet.
  const setup = setups
    .map((c) => ({ course: c, steps: setupSteps(c, { canEnroll: user.role === "admin" }) }))
    .find((c) => !setupComplete(c.steps));
  const completion = overallCompletion(data.courses);
  const courseOptions = data.courses.map(({ course }) => ({ id: course.id, code: course.code, title: course.title }));

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={
          <>
            Welcome back, <em>{name}</em>
          </>
        }
        actions={
          <>
            <PostAnnouncementDialog courses={courseOptions} />
            <Button asChild size="md" leading={<Icon icon={Plus} size={17} />}>
              <Link href="/instructor/courses/new">New course</Link>
            </Button>
          </>
        }
      />

      {data.courses.length === 0 && (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="Start your first course"
            description="Create a course, add modules and lessons, and upload a lecture. Its numbers show up here."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/instructor/courses/new">New course</Link>
              </Button>
            }
          />
        </Card>
      )}

      {setup && (
        <SetupChecklist courseId={setup.course.courseId} course={`${setup.course.code} · ${setup.course.title}`} steps={setup.steps} />
      )}

      <section aria-label="This week" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active learners" value={data.active} delta={`of ${plural(data.learners, "enrolled student")} · last 7 days`} />
        <StatCard
          label="Avg. completion"
          value={completion === null ? "—" : `${completion}%`}
          delta={completion === null ? "No published lessons or students yet" : "of published lessons, per enrollment"}
        />
        <Link href="/instructor/grading" className="rounded-card text-ink no-underline hover:text-ink">
          <Suspense fallback={<StatCard className="h-full" label="Waiting for grading" value="…" delta="Checking handed-in work" />}>
            <GradingStat queue={queue} now={now} />
          </Suspense>
        </Link>
        <Link href="/instructor/messages" className="rounded-card text-ink no-underline hover:text-ink">
          <StatCard className="h-full" label="Unanswered questions" value={data.unanswered} delta={data.unanswered ? "Students waiting in Questions" : "All caught up"} />
        </Link>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr_1fr]">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-[22px] pt-5 pb-3">
            <CardHeader title="Courses" />
            <Link href="/instructor/courses" className="text-small">
              All courses
            </Link>
          </div>
          <div className="overflow-x-auto">
            <DataTable
              className="min-w-[620px]"
              rows={data.courses}
              rowKey={(c) => c.course.id}
              empty="You're not teaching any courses yet."
              columns={[
                {
                  key: "course",
                  header: "Course",
                  width: "2.2fr",
                  cell: (c) => (
                    <Link href={`/instructor/courses/${c.course.id}`} className="flex min-w-0 flex-col gap-0.5 text-ink no-underline hover:text-terracotta">
                      <Eyebrow>{c.course.code}</Eyebrow>
                      <span className="truncate text-[15px] font-medium">{c.course.title}</span>
                    </Link>
                  ),
                },
                { key: "status", header: "Status", width: "1fr", cell: (c) => <StatusBadge status={c.course.status} size="md" /> },
                {
                  key: "learners",
                  header: "Learners",
                  width: "1fr",
                  cell: (c) => (
                    <span className="flex flex-col">
                      <span className="text-[15px]">{c.learners}</span>
                      <span className="text-[12px] text-ink-soft">{c.active} active this week</span>
                    </span>
                  ),
                },
                {
                  key: "completion",
                  header: "Completion",
                  width: "1.4fr",
                  cell: (c) => {
                    const pct = courseCompletion(c);
                    return pct === null ? (
                      <span className="text-ink-soft">—</span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <ProgressBar value={pct} className="grow" label={`${c.course.code} average completion`} />
                        <span className="w-10 text-right font-mono text-meta">{pct}%</span>
                      </span>
                    );
                  },
                },
              ]}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Suspense fallback={<NeedsGradingLoading />}>
            <NeedsGrading queue={queue} />
          </Suspense>

          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-[22px] pt-5 pb-3">
              <CardHeader title="Unanswered questions" />
              {data.unanswered > 0 && (
                <Badge tone="warning" size="md">
                  {data.unanswered}
                </Badge>
              )}
            </div>
            <DiscussionList
              items={questions}
              basePath="/instructor/messages"
              waiting
              empty={<p className="m-0 px-[22px] pb-6 text-small text-ink-soft">No questions waiting. Students&rsquo; questions show up here, oldest first.</p>}
            />
            <Link href="/instructor/messages" className="border-t border-line px-[22px] py-3 text-small">
              All questions
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

async function GradingStat({ queue, now }: { queue: Promise<QueueItem[]>; now: number }) {
  const items = await queue;
  const oldest = items[0];
  return (
    <StatCard
      className="h-full"
      attention={items.length > 0}
      label="Waiting for grading"
      value={items.length}
      delta={oldest ? `Oldest waiting ${waitedFor(oldest.submittedAt.getTime(), now)}` : "Nothing handed in to grade"}
    />
  );
}

/* "Needs grading": the oldest handed-in work first. */
async function NeedsGrading({ queue: pending }: { queue: Promise<QueueItem[]> }) {
  const queue = await pending;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-[22px] pt-5 pb-3">
        <CardHeader title="Needs grading" />
        {queue.length > 0 && (
          <Badge tone="warning" size="md">
            {queue.length}
          </Badge>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="m-0 px-[22px] pb-6 text-small text-ink-soft">Nothing to grade. Handed-in work shows up here, oldest first.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {queue.slice(0, SHOWN).map((item) => (
            <li key={item.submissionId} className="border-t border-line">
              <Link
                href={`/instructor/grading/${item.submissionId}`}
                className="flex items-center justify-between gap-3 px-[22px] py-3.5 text-ink no-underline hover:bg-oat hover:text-ink"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-medium">{item.student.name}</span>
                  <span className="truncate text-meta text-ink-soft">
                    {item.course.code} · {item.assignment.title} · <LocalDate at={item.submittedAt.getTime()} dateOnly />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.late && (
                    <Badge tone="warning" size="sm">
                      Late
                    </Badge>
                  )}
                  <Icon icon={ChevronRight} size={16} className="text-ink-soft" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/instructor/grading" className="border-t border-line px-[22px] py-3 text-small">
        Grading queue
      </Link>
    </Card>
  );
}

function NeedsGradingLoading() {
  return (
    <SkeletonCard lines={3} className="min-h-[220px]">
      <Skeleton className="h-4.5 w-32 rounded-full" />
      <SkeletonText lines={3} />
    </SkeletonCard>
  );
}
