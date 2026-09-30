import Link from "next/link";
import { Card, CardHeader, Eyebrow, ProgressRing } from "@/components/ui";
import { formatPercent } from "@/lib/coursework/gradebook";
import type { CourseProgressView } from "@/lib/db/learners";
import { learnerCompletion } from "@/lib/dashboard/stats";
import { plural } from "@/lib/utils/format";
import { LessonProgressList } from "./lesson-progress-list";
import { TopicMastery } from "./topic-mastery";

/* One course on the student's /progress (feature 31): completion (the
   same rule as the course card and the teacher's numbers), each lesson,
   quiz mastery per topic and grades so far. */
export function CourseProgressCard({ progress }: { progress: CourseProgressView }) {
  const { course, grades } = progress;
  const completion = learnerCompletion(progress.completed, progress.lessons);

  return (
    <Card className="gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>{course.code}</Eyebrow>
          <CardHeader
            title={
              <Link href={`/courses/${course.id}`} className="text-ink no-underline hover:text-terracotta">
                {course.title}
              </Link>
            }
          />
        </div>
        {completion === null ? (
          <span className="text-meta text-ink-soft">No lessons published yet</span>
        ) : (
          <ProgressRing value={completion} caption={`${progress.completed} of ${plural(progress.lessons, "lesson")} done`} />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[16px] font-semibold">Lessons</h3>
          <LessonProgressList modules={progress.modules} courseId={course.id} linked headingLevel={4} />
        </section>

        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-[16px] font-semibold">Mastery by topic</h3>
            <TopicMastery
              topics={progress.mastery}
              untried={progress.untried}
              courseId={course.id}
              linked
              empty="Take a quiz in any lesson and your mastery of each topic shows here."
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-[16px] font-semibold">Grades so far</h3>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="font-serif text-[36px] leading-none">{formatPercent(grades.percent)}</span>
                <span className="text-meta text-ink-soft">{grades.percent === null ? "Nothing graded yet" : "Course total so far"}</span>
              </span>
              <Link href="/grades" className="text-small">
                All grades
              </Link>
            </div>
            <p className="m-0 text-meta text-ink-soft">{gradeLine(grades)}</p>
          </section>
        </div>
      </div>
    </Card>
  );
}

/* "2 graded · 1 waiting for a grade · 1 missing · 2 still open". */
function gradeLine(g: CourseProgressView["grades"]): string {
  const parts = [`${g.graded} graded`];
  if (g.waiting) parts.push(`${g.waiting} waiting for a grade`);
  if (g.missing) parts.push(`${g.missing} missing`);
  if (g.open) parts.push(`${g.open} still open`);
  return g.graded + g.waiting + g.missing + g.open === 0 ? "No assignments or graded quizzes yet." : parts.join(" · ");
}
