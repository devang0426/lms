import { Table2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GradebookCellView } from "@/components/coursework/gradebook-cell";
import { LocalDate } from "@/components/coursework/local-date";
import { LessonProgressList } from "@/components/progress/lesson-progress-list";
import { TopicMastery } from "@/components/progress/topic-mastery";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, CardHeader, Icon, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPercent } from "@/lib/coursework/gradebook";
import { CATEGORY_LABELS } from "@/lib/coursework/rules";
import { loadStudentReport } from "@/lib/db/learners";
import { timeAgo } from "@/lib/notifications/view";
import { requestTime } from "@/lib/utils/clock";
import { plural } from "@/lib/utils/format";

export const metadata = { title: "Student report · Studyhall" };

/* One student's course report (feature 31), opened from Learners or the
   course's Students tab: per-lesson completion, quiz mastery per topic and
   grades, with the gradebook's cells (drafts and work to grade link to the
   grade view). One batch after the user lookup; every statement checks
   that the viewer teaches the course and the student is actively
   enrolled, so anyone else's course or student is a 404. Nothing from the
   student's assistant chats or private space. */
export default async function StudentReportPage({ params }: PageProps<"/instructor/courses/[courseId]/students/[studentId]">) {
  const { courseId, studentId } = await params;
  const user = await requireUser();
  const now = requestTime();
  const report = await loadStudentReport(courseId, studentId, user, new Date(now));
  if (!report) notFound();
  const { course, learner, grades, items } = report;
  const home = `/instructor/courses/${course.id}`;

  return (
    <>
      <Breadcrumbs items={[{ label: course.code, href: home }, { label: "Students", href: `${home}?tab=students` }, { label: learner.name }]} />
      <PageHeader
        eyebrow={`${course.code} · Student report`}
        title={learner.name}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href={`${home}/gradebook`}>
              <Icon icon={Table2} size={16} />
              Gradebook
            </Link>
          </Button>
        }
      />
      <p className="m-0 text-small text-ink-soft">
        {learner.email} · {learner.sections} ·{" "}
        {learner.lastActivityAt ? (
          <>
            last active <time dateTime={learner.lastActivityAt.toISOString()}>{timeAgo(learner.lastActivityAt.getTime(), now)}</time>
          </>
        ) : (
          "no activity yet"
        )}
      </p>

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lessons completed"
          value={learner.completion === null ? "—" : `${learner.completion}%`}
          delta={`${learner.completed} of ${plural(report.lessons, "published lesson")}`}
        />
        <StatCard
          label="Average quiz score"
          value={learner.quizPercent === null ? "—" : `${learner.quizPercent}%`}
          delta={learner.quizAttempts ? `Over ${plural(learner.quizAttempts, "attempt")}` : "No quizzes taken yet"}
        />
        <StatCard
          label="Assignments handed in"
          value={learner.handedIn}
          attention={learner.missing > 0}
          delta={`${learner.graded} graded${learner.missing ? ` · ${learner.missing} missing` : ""}`}
        />
        <StatCard label="Course total so far" value={formatPercent(grades.total.percent)} delta="Returned grades and graded quizzes" />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="gap-4">
          <CardHeader title="Lessons" />
          <LessonProgressList modules={report.modules} courseId={course.id} linked={false} headingLevel={3} />
        </Card>
        <Card className="gap-4">
          <CardHeader title="Quiz mastery by topic" />
          <TopicMastery
            topics={report.mastery}
            untried={report.untried}
            courseId={course.id}
            linked={false}
            empty="No quiz answers yet. Mastery shows here once they take a practice or graded quiz."
          />
        </Card>
      </div>

      <Card className="gap-2">
        <CardHeader title="Grades" />
        {items.length === 0 ? (
          <p className="m-0 text-small text-ink-soft">No assignments or graded quizzes in this course yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {items.map((item, i) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3 last:border-b-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{item.title}</span>
                  <span className="text-meta text-ink-soft">
                    {item.kind === "quiz" ? "Graded quiz" : CATEGORY_LABELS[item.category]} · {item.points} points · due <LocalDate at={item.dueAt} />
                  </span>
                </span>
                <GradebookCellView cell={grades.cells[i]} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
