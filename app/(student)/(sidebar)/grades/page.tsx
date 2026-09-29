import Link from "next/link";
import { LocalDate } from "@/components/coursework/local-date";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, EmptyState, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { categoryWeights, courseTotal, formatPercent } from "@/lib/coursework/gradebook";
import { CATEGORY_LABELS, dueLabel, dueState, formatPoints } from "@/lib/coursework/rules";
import { listCoursesForStudent } from "@/lib/db/courses";
import { studentGradeRows, weightRowsFor, type StudentGradeRow } from "@/lib/db/grades";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Grades · Studyhall" };

/* A student's own grades, per course (feature 20): every assignment and
   graded quiz they can see, with returned scores and a course total
   (the same weighting as the instructor's gradebook). A draft grade shows
   as "Handed in" until it's returned. */
export default async function GradesPage() {
  const user = await requireUser();
  const [courses, rows] = await Promise.all([listCoursesForStudent(user.id), studentGradeRows(user)]);
  const weightRows = await weightRowsFor(courses.map((c) => c.course.id));
  const now = requestTime();

  return (
    <>
      <PageHeader
        eyebrow="Grades"
        title={
          <>
            Your <em>grades</em>
          </>
        }
      />
      {courses.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState title="No courses yet" description="Once you're enrolled in a course, its assignments and quizzes are graded here." />
        </Card>
      ) : (
        courses.map(({ course }) => {
          const items = rows.filter((r) => r.courseId === course.id);
          const counted = items.flatMap((r) => (r.score !== null && r.maxScore !== null ? [{ category: r.category, score: r.score, maxScore: r.maxScore }] : []));
          const total = courseTotal(counted, categoryWeights(weightRows.filter((w) => w.courseId === course.id)));
          return (
            <Card key={course.id} className="gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Eyebrow>{course.code}</Eyebrow>
                  <CardHeader title={course.title} />
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-serif text-[44px] leading-none">{formatPercent(total.percent)}</span>
                  <span className="text-meta text-ink-soft">{total.percent === null ? "Nothing graded yet" : "Course total so far"}</span>
                </div>
              </div>
              {items.length === 0 ? (
                <p className="m-0 text-small text-ink-soft">No assignments or graded quizzes in this course yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {items.map((item) => (
                    <li key={item.itemId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3 last:border-b-0">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link
                          href={`/courses/${course.id}/lessons/${item.lessonId}`}
                          className="text-[15px] font-medium text-ink no-underline hover:text-terracotta"
                        >
                          {item.title}
                        </Link>
                        <span className="text-meta text-ink-soft">
                          {item.kind === "quiz" ? "Graded quiz" : CATEGORY_LABELS[item.category]} · {item.points} points · due{" "}
                          <LocalDate at={item.dueAt.getTime()} />
                        </span>
                      </span>
                      <ItemState item={item} now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}

function ItemState({ item, now }: { item: StudentGradeRow; now: number }) {
  const late = item.late && (
    <Badge tone="warning" size="md">
      Late
    </Badge>
  );
  if (item.score !== null && item.maxScore !== null) {
    return (
      <span className="flex items-center gap-2.5">
        {late}
        <span className="font-serif text-[22px] whitespace-nowrap">
          {formatPoints(item.score)}
          <span className="text-[16px] text-ink-soft"> / {item.maxScore}</span>
        </span>
      </span>
    );
  }
  if (item.status) {
    return (
      <span className="flex items-center gap-2">
        {late}
        <Badge tone="neutral" size="md">
          Handed in
        </Badge>
      </span>
    );
  }
  const due = item.dueAt.getTime();
  const state = dueState(due, now);
  if (state === "overdue") return <span className="text-meta text-ink-soft">Not handed in</span>;
  if (state === "soon")
    return (
      <Badge tone="warning" size="md">
        {dueLabel(due, now)}
      </Badge>
    );
  return <span className="text-meta text-ink-soft">Open</span>;
}
