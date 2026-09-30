import { Download } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardHeader, EmptyState, Eyebrow, Icon, ProgressBar } from "@/components/ui";
import { timeAgo } from "@/lib/notifications/view";
import { averageCompletion, type CourseLearners, type LearnerRow } from "@/lib/progress/learners";
import { cn } from "@/lib/utils/cn";
import { plural } from "@/lib/utils/format";

/* One course's students (feature 31): name, section, last activity,
   lessons completed of those published, average quiz score and
   assignments handed in, graded and missing. A name opens the student's
   report. Used on /instructor/learners (with the course as its heading)
   and in the course builder's Students tab (without). A real <table>, like
   the gradebook: it scrolls sideways on a phone, with the Student column
   pinned. */

export function CourseLearnersCard({ data, now, withCourse }: { data: CourseLearners; now: number; withCourse: boolean }) {
  const { course } = data;
  const average = averageCompletion(data);
  const summary = [
    plural(data.learners.length, "student"),
    plural(data.lessons, "published lesson"),
    ...(average === null ? [] : [`${average}% average completion`]),
  ].join(" · ");

  return (
    <Card padded={false} className="overflow-hidden">
      <div className={cn("flex flex-wrap justify-between gap-3 px-[22px] pt-5 pb-4", withCourse ? "items-end" : "items-center")}>
        <div className="flex min-w-0 flex-col gap-1">
          {withCourse && (
            <>
              <Eyebrow>{course.code}</Eyebrow>
              <CardHeader
                title={
                  <Link href={`/instructor/courses/${course.id}`} className="text-ink no-underline hover:text-terracotta">
                    {course.title}
                  </Link>
                }
              />
            </>
          )}
          <span className="text-meta text-ink-soft">{summary}</span>
        </div>
        {data.learners.length > 0 && (
          <Button asChild variant="secondary" size="sm">
            {/* No ".csv" in the path: proxy.ts skips file-like paths, and the session is needed. */}
            <a href={`/instructor/courses/${course.id}/students/export`} download>
              <Icon icon={Download} size={16} />
              Export CSV
            </a>
          </Button>
        )}
      </div>
      {data.learners.length === 0 ? (
        <EmptyState
          className="border-t border-line py-10"
          title="No students yet"
          description="Students appear here once they're enrolled in a section of this course."
        />
      ) : (
        <LearnersTable data={data} now={now} />
      )}
    </Card>
  );
}

function LearnersTable({ data, now }: { data: CourseLearners; now: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-small">
        <caption className="sr-only">Students in {data.course.title}, with their progress</caption>
        <thead>
          <tr className="bg-oat text-left font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">
            <th scope="col" className="sticky left-0 z-10 bg-oat px-[22px] py-2.5 font-normal">
              Student
            </th>
            <th scope="col" className="px-4 py-2.5 font-normal">
              Section
            </th>
            <th scope="col" className="px-4 py-2.5 font-normal">
              Last activity
            </th>
            <th scope="col" className="min-w-[150px] px-4 py-2.5 font-normal">
              Lessons
            </th>
            <th scope="col" className="px-4 py-2.5 font-normal">
              Avg. quiz
            </th>
            <th scope="col" className="px-[22px] py-2.5 font-normal">
              Assignments
            </th>
          </tr>
        </thead>
        <tbody>
          {data.learners.map((l) => (
            <tr key={l.userId} className="border-t border-line align-top">
              <th scope="row" className="sticky left-0 z-10 bg-paper px-[22px] py-4 text-left font-normal">
                <Link
                  href={`/instructor/courses/${data.course.id}/students/${l.userId}`}
                  className="block text-[15px] font-medium text-ink no-underline hover:text-terracotta"
                >
                  {l.name}
                </Link>
                <span className="block text-meta text-ink-soft">{l.email}</span>
              </th>
              <td className="px-4 py-4">{l.sections}</td>
              <td className="px-4 py-4 whitespace-nowrap">
                {l.lastActivityAt ? (
                  <time dateTime={l.lastActivityAt.toISOString()}>{timeAgo(l.lastActivityAt.getTime(), now)}</time>
                ) : (
                  <span className="text-ink-soft">Not yet</span>
                )}
              </td>
              <td className="px-4 py-4">
                <LessonsCell learner={l} lessons={data.lessons} />
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                {l.quizPercent === null ? (
                  <span className="text-ink-soft">—</span>
                ) : (
                  <span className="flex flex-col">
                    <span className="text-[15px]">{l.quizPercent}%</span>
                    <span className="text-meta text-ink-soft">{plural(l.quizAttempts, "attempt")}</span>
                  </span>
                )}
              </td>
              <td className="px-[22px] py-4">
                {data.assignments === 0 ? (
                  <span className="text-ink-soft">—</span>
                ) : (
                  <span className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap">
                      {l.handedIn} handed in · {l.graded} graded
                    </span>
                    {l.missing > 0 && (
                      <Badge tone="warning" size="sm">
                        {l.missing} missing
                      </Badge>
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LessonsCell({ learner, lessons }: { learner: LearnerRow; lessons: number }) {
  if (lessons === 0 || learner.completion === null) return <span className="text-ink-soft">—</span>;
  return (
    <span className="flex flex-col gap-1.5">
      <span className="whitespace-nowrap">
        {learner.completed} / {lessons}
        <span className="text-ink-soft"> · {learner.completion}%</span>
      </span>
      <ProgressBar value={learner.completion} label={`${learner.name}: lessons completed`} />
    </span>
  );
}
