import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { GradebookCellView } from "@/components/coursework/gradebook-cell";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState, Icon } from "@/components/ui";
import { requireCourseStaff } from "@/lib/auth";
import {
  buildGradebook,
  categoryWeights,
  CATEGORY_ORDER,
  formatPercent,
  weightPercents,
} from "@/lib/coursework/gradebook";
import { CATEGORY_LABELS } from "@/lib/coursework/rules";
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
      <Breadcrumbs items={[{ label: course.code, href: `/instructor/courses/${courseId}` }, { label: "Gradebook" }]} />
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
                        <GradebookCellView cell={cell} />
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
