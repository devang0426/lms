import "katex/dist/katex.min.css";

import { notFound } from "next/navigation";
import { GradeForm } from "@/components/coursework/grade-form";
import { LocalDate } from "@/components/coursework/local-date";
import { SubmittedWork } from "@/components/coursework/submitted-work";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { formatPoints } from "@/lib/coursework/rules";
import { isUuid } from "@/lib/db/courses";
import { submissionForGrading } from "@/lib/db/grades";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = { title: "Grade · Studyhall" };

/* The grade view (feature 20): the submission on the left, score and
   feedback on the right. Only the course's staff get it (checked in the
   query); anyone else gets a 404. */
export default async function GradeSubmissionPage({ params }: PageProps<"/instructor/grading/[submissionId]">) {
  const { submissionId } = await params;
  const user = await requireAreaRole("instructor", "admin");
  if (!isUuid(submissionId)) notFound();
  const sub = await submissionForGrading(submissionId, user);
  if (!sub) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Grading", href: "/instructor/grading" },
          {
            label: `${sub.course.code} · ${sub.assignment.title}`,
            href: `/instructor/courses/${sub.course.id}/lessons/${sub.assignment.lessonId}`,
          },
          { label: sub.student.name },
        ]}
      />
      <PageHeader
        eyebrow={`${sub.course.code} · ${sub.assignment.title}`}
        title={sub.student.name}
        actions={
          <>
            {sub.late && <Badge tone="warning">Late</Badge>}
            {sub.status === "submitted" && <Badge tone="neutral">To grade</Badge>}
            {sub.status === "graded" && <Badge tone="neutral">Draft grade</Badge>}
            {sub.status === "returned" && <Badge tone="success">Returned</Badge>}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-h3 font-semibold">Submission</h2>
              <span className="text-meta text-ink-soft">
                {sub.studentEmail} · handed in <LocalDate at={sub.submittedAt.getTime()} /> · due{" "}
                <LocalDate at={sub.assignment.dueAt.getTime()} />
              </span>
            </div>
            <SubmittedWork submissionId={sub.submissionId} text={sub.text} files={sub.files} />
          </Card>
          <Card variant="sunken" className="gap-3">
            <details>
              <summary className="cursor-pointer text-[15px] font-medium">Instructions</summary>
              <div className="pt-3">
                {sub.instructions.trim() ? (
                  <div className="study-notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(sub.instructions) }} />
                ) : (
                  <p className="m-0 text-small text-ink-soft">No written instructions.</p>
                )}
              </div>
            </details>
          </Card>
        </div>

        <Card className="gap-4 lg:sticky lg:top-6">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-h3 font-semibold">Grade</h2>
            {sub.grade && (
              <span className="text-meta text-ink-soft">
                {sub.status === "returned" ? "Returned" : "Draft saved"} <LocalDate at={sub.grade.gradedAt.getTime()} />
                {sub.gradedByName && <> by {sub.gradedByName}</>}
              </span>
            )}
          </div>
          <GradeForm
            key={sub.submissionId}
            submissionId={sub.submissionId}
            studentName={sub.student.name}
            points={sub.assignment.points}
            status={sub.status}
            initial={{ score: sub.grade ? formatPoints(sub.grade.score) : "", feedback: sub.grade?.feedback ?? "" }}
          />
        </Card>
      </div>
    </>
  );
}
