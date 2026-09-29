import "katex/dist/katex.min.css";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Eyebrow } from "@/components/ui";
import { CATEGORY_LABELS, formatPoints, SUBMIT_MESSAGES, submitCheck } from "@/lib/coursework/rules";
import type { Assignment, Grade, Submission } from "@/lib/db/schema";
import { renderMarkdown } from "@/lib/markdown";
import { DueLine } from "./due-line";
import { LocalDate } from "./local-date";
import { SubmitForm } from "./submit-form";
import { SubmittedWork, type SubmittedFileView } from "./submitted-work";

/* An assignment lesson in the player (feature 20), where a video would
   be: instructions, the due date (Butter badge when due soon), and the
   student's own work. They hand in until it's graded; once the grade is
   returned they see the score and feedback. Staff previewing see the
   instructions and a way to the grading queue. Instructions and feedback
   are Markdown, rendered sanitized (with KaTeX). */

export function AssignmentPanel({
  lessonId,
  userId,
  assignment,
  submission,
  grade,
  preview,
  now,
}: {
  lessonId: string;
  userId: string;
  assignment: Assignment | null;
  submission: Submission | null;
  grade: Pick<Grade, "score" | "maxScore" | "feedback" | "gradedAt"> | null;
  preview: boolean;
  now: number;
}) {
  if (!assignment) {
    return (
      <Card padded={false} className="border-dashed">
        <EmptyState
          title="No instructions yet"
          description={preview ? "Set the instructions, due date and points in the lesson editor." : "Your instructor hasn't posted this assignment yet."}
        />
      </Card>
    );
  }

  const dueAt = assignment.dueAt.getTime();
  const check = submitCheck({ dueAt, allowLate: assignment.allowLate, status: submission?.status ?? null }, now);

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>
            {`Assignment · ${CATEGORY_LABELS[assignment.category]} · ${assignment.points} ${assignment.points === 1 ? "point" : "points"}`}
          </Eyebrow>
          {submission && <SubmissionBadge status={submission.status} late={submission.late} />}
        </div>
        <DueLine dueAt={dueAt} allowLate={assignment.allowLate} now={now} />
        {assignment.instructions.trim() ? (
          <div className="study-notes max-w-[760px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(assignment.instructions) }} />
        ) : (
          <p className="m-0 text-small text-ink-soft">No written instructions.</p>
        )}
      </Card>

      {preview ? (
        <Card variant="sunken" className="gap-3">
          <p className="m-0 text-small">Students hand in their work here. It lands in your grading queue, oldest first.</p>
          <div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/instructor/grading">Open the grading queue</Link>
            </Button>
          </div>
        </Card>
      ) : submission?.status === "returned" && grade ? (
        <Card className="gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Eyebrow>Your grade</Eyebrow>
              <span className="font-serif text-[48px] leading-none">
                {formatPoints(grade.score)}
                <span className="text-[28px] text-ink-soft"> / {grade.maxScore}</span>
              </span>
            </div>
            <span className="text-meta text-ink-soft">
              Returned <LocalDate at={grade.gradedAt.getTime()} />
            </span>
          </div>
          {grade.feedback.trim() && (
            <div className="flex flex-col gap-2 rounded-card bg-sage-tint px-6 py-5">
              <Eyebrow className="text-sage-ink">Feedback</Eyebrow>
              <div className="study-notes" dangerouslySetInnerHTML={{ __html: renderMarkdown(grade.feedback) }} />
            </div>
          )}
          <details className="group">
            <summary className="cursor-pointer text-small text-ink-soft">What you handed in</summary>
            <div className="pt-3">
              <SubmittedWork submissionId={submission.id} text={submission.text} files={fileViews(submission)} />
            </div>
          </details>
        </Card>
      ) : submission && !check.ok ? (
        <Card className="gap-4">
          <CardTitle>Your work</CardTitle>
          <p className="m-0 text-small text-ink-soft">
            {submission.status === "graded"
              ? "Handed in. Your instructor is grading it; the grade shows here once it's returned."
              : SUBMIT_MESSAGES[check.reason]}
          </p>
          <SubmittedWork submissionId={submission.id} text={submission.text} files={fileViews(submission)} />
        </Card>
      ) : check.ok ? (
        <Card className="gap-4">
          <CardTitle>
            {submission ? (
              <>
                Your work · handed in <LocalDate at={submission.submittedAt.getTime()} />
              </>
            ) : (
              "Hand in your work"
            )}
          </CardTitle>
          <SubmitForm
            // Remount after a hand-in so the form starts from the saved version.
            key={submission?.submittedAt.getTime() ?? "new"}
            lessonId={lessonId}
            assignmentId={assignment.id}
            userId={userId}
            initialText={submission?.text ?? ""}
            currentFiles={submission ? fileViews(submission) : []}
            late={check.late}
            resubmitting={Boolean(submission)}
          />
        </Card>
      ) : (
        <Card variant="sunken">
          <p className="m-0 text-small">{SUBMIT_MESSAGES[check.reason]} Nothing was handed in.</p>
        </Card>
      )}
    </div>
  );
}

/* Names and sizes only: file URLs never leave the server. */
function fileViews(submission: Submission): SubmittedFileView[] {
  return submission.files.map((f) => ({ name: f.name, contentType: f.contentType, size: f.size }));
}

function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-h3 font-semibold">{children}</h2>;
}

export function SubmissionBadge({ status, late }: { status: Submission["status"]; late: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {late && (
        <Badge tone="warning" size="md">
          Late
        </Badge>
      )}
      {status === "returned" ? (
        <Badge tone="success" size="md">
          Graded
        </Badge>
      ) : (
        <Badge tone="neutral" size="md">
          Handed in
        </Badge>
      )}
    </span>
  );
}
