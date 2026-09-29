import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import { requireCourseStaff } from "@/lib/auth";
import {
  buildGradebook,
  categoryWeights,
  CATEGORY_ORDER,
  formatPercent,
  weightPercents,
  type GradebookCell,
} from "@/lib/coursework/gradebook";
import { CATEGORY_LABELS, formatPoints } from "@/lib/coursework/rules";
import { getCourseForUser } from "@/lib/db/courses";
import { gradebookData } from "@/lib/db/grades";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Gradebook · Studyhall" };

/* The gradebook (feature 20): enrolled students × the course's
   assignments and graded quizzes, with a weighted total and a CSV export.
   Course staff only (404 otherwise). Totals count what students can see:
   returned grades and graded quizzes. */
export default async function GradebookPage({ params }: PageProps<"/instructor/courses/[courseId]/gradebook">) {
  const { courseId } = await params;
  const user = await requireCourseStaff(courseId);
  const [found, data] = await Promise.all([getCourseForUser(courseId, user), gradebookData(courseId)]);
  if (!found) notFound();
  const { course } = found;

  const weights = categoryWeights(data.weightRows);
  const percents = weightPercents(weights);
  const rows = buildGradebook({ students: data.students, items: data.items, facts: data.facts, weights, now: requestTime() });
  const equal = new Set(CATEGORY_ORDER.map((c) => percents[c])).size === 1;

  return (
    <>
      <Link href={`/instructor/courses/${courseId}`} className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        {course.code} · Curriculum
      </Link>
      <PageHeader
        eyebrow={`${course.code} · Gradebook`}
        title={course.title}
        actions={
          <Button asChild variant="secondary" size="sm" leading={<Icon icon={Download} size={16} />}>
            <a href={`/instructor/courses/${courseId}/gradebook/export`} download>
              Export CSV
            </a>
          </Button>
        }
      />
      <p className="m-0 text-small text-ink-soft">
        {`Total: ${CATEGORY_ORDER.map((c) => `${CATEGORY_LABELS[c]} ${percents[c]}%`).join(" · ")}${equal ? " (equal weights)" : ""}. `}
        Only returned grades and graded quizzes count, and a category with nothing graded yet is left out of a student&apos;s total.
      </p>

      {data.items.length === 0 || data.students.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title={data.students.length === 0 ? "No students yet" : "Nothing to grade yet"}
            description={
              data.students.length === 0
                ? "Students appear here once they're enrolled in a section of this course."
                : "Add an assignment lesson in the curriculum, or a graded quiz on a lesson, and it gets a column here."
            }
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-small">
              <caption className="sr-only">Grades for {course.title}, one row per student</caption>
              <thead>
                <tr className="bg-oat text-left align-bottom font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">
                  <th scope="col" className="sticky left-0 z-10 bg-oat px-[22px] py-2.5 font-normal">
                    Student
                  </th>
                  {data.items.map((item) => (
                    <th key={item.id} scope="col" className="min-w-[150px] px-4 py-2.5 font-normal">
                      <span className="block font-sans text-[13px] font-medium tracking-normal text-ink normal-case">{item.title}</span>
                      {CATEGORY_LABELS[item.category]} · {item.points} pts
                    </th>
                  ))}
                  <th scope="col" className="px-[22px] py-2.5 text-right font-normal">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-10 bg-paper px-[22px] py-4 text-left font-normal">
                      <span className="block text-[15px] font-medium">{row.student.name}</span>
                      <span className="block text-meta text-ink-soft">{row.student.email}</span>
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={data.items[i].id} className="px-4 py-4">
                        <Cell cell={cell} />
                      </td>
                    ))}
                    <td className="px-[22px] py-4 text-right font-serif text-[22px] whitespace-nowrap">{formatPercent(row.total.percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Cell({ cell }: { cell: GradebookCell }) {
  switch (cell.kind) {
    case "score": {
      const value = (
        <span className="whitespace-nowrap">
          <span className="text-[15px] text-ink">{formatPoints(cell.score)}</span>
          <span className="text-ink-soft"> / {cell.maxScore}</span>
        </span>
      );
      return (
        <span className="flex flex-wrap items-center gap-2">
          {cell.submissionId ? (
            <Link href={`/instructor/grading/${cell.submissionId}`} className="no-underline hover:underline">
              {value}
            </Link>
          ) : (
            value
          )}
          {cell.late && (
            <Badge tone="warning" size="sm">
              Late
            </Badge>
          )}
        </span>
      );
    }
    case "draft":
      return (
        <Link href={`/instructor/grading/${cell.submissionId}`} className="whitespace-nowrap text-ink-soft hover:text-ink">
          Draft · {formatPoints(cell.score)} / {cell.maxScore}
        </Link>
      );
    case "to_grade":
      return (
        <Link href={`/instructor/grading/${cell.submissionId}`} className="no-underline">
          <Badge tone="warning" size="md">
            To grade{cell.late ? " · late" : ""}
          </Badge>
        </Link>
      );
    case "missing":
      return <span className="text-ink-soft">Missing</span>;
    case "none":
      return (
        <span className="text-ink-soft" aria-label="Not due yet">
          —
        </span>
      );
    default: {
      const never: never = cell;
      return never;
    }
  }
}
