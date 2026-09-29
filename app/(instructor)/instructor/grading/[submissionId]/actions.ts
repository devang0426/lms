"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { parseScore } from "@/lib/coursework/rules";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { nextInQueue, saveGradeStatements, submissionForGrading } from "@/lib/db/grades";
import { notifyStatement } from "@/lib/db/notifications";
import { gradeNoticeTitle } from "@/lib/notifications/view";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Grade a submission (feature 20). zod → the viewer teaches its course
   (submissionForGrading, in SQL) → the grade, the submission's status and
   the audit row in one batch. `returnToStudent` gives the grade and
   feedback to the student; without it the grade is a draft only staff
   see. A returned grade can be corrected but never taken back. */

const input = z.object({
  submissionId: z.uuid(),
  score: z.string().max(12),
  feedback: z.string().trim().max(20_000, "Keep the feedback under 20,000 characters."),
  returnToStudent: z.boolean(),
});

export async function saveGrade(raw: z.input<typeof input>): Promise<ActionResult<{ nextId: string | null; returned: boolean }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the grade and try again.");
  const { submissionId, feedback, returnToStudent } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const sub = await submissionForGrading(submissionId, user);
  if (!sub) return fail("not_found", "That submission doesn't exist or isn't in a course you teach.");

  const maxScore = sub.assignment.points;
  const score = parseScore(parsed.data.score, maxScore);
  if (score === null) return fail("invalid", `Enter a score from 0 to ${maxScore}, with up to two decimals.`);

  const status = sub.status === "returned" || returnToStudent ? "returned" : "graded";
  await db.batch([
    ...saveGradeStatements({ submissionId, studentId: sub.student.id, score, maxScore, feedback, gradedBy: user.id, status }),
    auditInsert({
      actorId: user.id,
      action: status === "returned" ? "grade.return" : "grade.draft",
      entityType: "submission",
      entityId: submissionId,
      data: { score, maxScore, studentId: sub.student.id, assignmentId: sub.assignment.id },
    }),
    // Feature 21: the student hears once the grade is theirs to read (a
    // draft stays quiet), and again if a returned grade is corrected.
    ...(status === "returned"
      ? [
          notifyStatement({
            userId: sub.student.id,
            kind: "grade_returned",
            title: gradeNoticeTitle(sub.assignment.title, sub.status === "returned"),
            url: `/courses/${sub.course.id}/lessons/${sub.assignment.lessonId}`,
          }),
        ]
      : []),
  ]);

  revalidatePath("/instructor/grading");
  revalidatePath(`/instructor/grading/${submissionId}`);
  revalidatePath(`/instructor/courses/${sub.course.id}/gradebook`);
  revalidatePath(`/courses/${sub.course.id}/lessons/${sub.assignment.lessonId}`);
  revalidatePath("/grades");
  return ok({ nextId: status === "returned" ? await nextInQueue(user, submissionId) : null, returned: status === "returned" });
}
