"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGrade } from "@/app/(instructor)/instructor/grading/[submissionId]/actions";
import { Button, Field, Input, Textarea, toast } from "@/components/ui";
import type { SubmissionStatus } from "@/lib/db/schema";

/* Score and feedback for one submission (feature 20). "Save and next"
   returns the grade to the student and opens the next submission in the
   queue; "Save draft" keeps it with staff. A returned grade can still be
   corrected ("Update grade"). Feedback is Markdown. */

export function GradeForm({
  submissionId,
  studentName,
  points,
  status,
  initial,
}: {
  submissionId: string;
  studentName: string;
  points: number;
  status: SubmissionStatus;
  initial: { score: string; feedback: string };
}) {
  const router = useRouter();
  const [score, setScore] = useState(initial.score);
  const [feedback, setFeedback] = useState(initial.feedback);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [pendingAction, setPendingAction] = useState<"draft" | "return" | null>(null);
  const returned = status === "returned";

  const save = (returnToStudent: boolean) => {
    setError(null);
    setPendingAction(returnToStudent ? "return" : "draft");
    startSaving(async () => {
      const res = await saveGrade({ submissionId, score, feedback, returnToStudent });
      if (!res.ok) {
        setPendingAction(null);
        return setError(res.error.message);
      }
      if (!res.data.returned) {
        toast.success(`Draft saved. ${studentName} can't see it until you return it.`);
        setPendingAction(null);
        return;
      }
      if (returned) {
        toast.success(`Grade updated. ${studentName} sees the new score and feedback.`);
        setPendingAction(null);
        return;
      }
      toast.success(`Returned to ${studentName}.`);
      router.push(res.data.nextId ? `/instructor/grading/${res.data.nextId}` : "/instructor/grading");
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
    >
      <Field label="Score" htmlFor="grade-score" hint={`Out of ${points}. Up to two decimals, e.g. 7.5.`}>
        <div className="flex items-center gap-3">
          <Input
            id="grade-score"
            inputMode="decimal"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="max-w-[140px] font-serif text-[22px]"
            autoFocus
          />
          <span className="font-serif text-[22px] text-ink-soft">/ {points}</span>
        </div>
      </Field>
      <Field label="Feedback" htmlFor="grade-feedback" hint="Markdown works. The student reads this with their score.">
        <Textarea id="grade-feedback" value={feedback} rows={10} maxLength={20_000} onChange={(e) => setFeedback(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {returned ? (
          <Button type="submit" size="md" loading={saving}>
            Update grade
          </Button>
        ) : (
          <>
            <Button variant="quiet" size="md" loading={saving && pendingAction === "draft"} disabled={saving} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button type="submit" size="md" loading={saving && pendingAction === "return"} disabled={saving}>
              Save and next
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
