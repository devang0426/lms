"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import { createGradedQuizStatements } from "@/lib/db/quizzes";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Create a graded quiz from the lesson's question bank (feature 16).
   zod → course staff → the quiz, the move of its questions to the graded
   bank (so practice never shows them) and the audit row, in one batch. */

const input = z.object({
  lessonId: z.uuid(),
  title: z.string().trim().min(1, "Give the quiz a title.").max(120, "Keep the title under 120 characters."),
  /* ISO time from the browser, so the instructor's time zone is kept. */
  dueAt: z.iso.datetime({ offset: true, message: "Pick a due date and time." }),
  maxAttempts: z.number().int().min(1, "Allow at least one attempt.").max(10, "Ten attempts at most."),
  points: z.number().int().min(1, "Give it at least 1 point.").max(1000, "1,000 points at most."),
  questionIds: z.array(z.uuid()).min(1, "Pick at least one question.").max(50, "Fifty questions at most."),
});

export async function createGradedQuiz(raw: z.input<typeof input>): Promise<ActionResult<{ id: string }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { lessonId, title, maxAttempts, points } = parsed.data;
  const dueAt = new Date(parsed.data.dueAt);
  if (dueAt.getTime() <= Date.now()) return fail("invalid", "The due date has to be in the future.");

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const courseId = await courseIdForLesson(lessonId);
  if (!courseId || (await getCourseAccess(courseId, user)) !== "staff") {
    return fail("not_found", "That lesson doesn't exist or isn't yours to edit.");
  }

  const questionIds = [...new Set(parsed.data.questionIds)];
  const created = await createGradedQuizStatements({ lessonId, title, questionIds, dueAt, maxAttempts, points, createdBy: user.id });
  if (!created) return fail("invalid", "Some of those questions aren't in this lesson any more. Reload and pick again.");
  await db.batch([
    ...created.statements,
    auditInsert({
      actorId: user.id,
      action: "graded_quiz.create",
      entityType: "lesson",
      entityId: lessonId,
      data: { quizId: created.id, questions: questionIds.length, points, maxAttempts, dueAt: dueAt.toISOString() },
    }),
  ]);
  revalidatePath(`/instructor/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/courses/${courseId}/lessons/${lessonId}`);
  return ok({ id: created.id });
}
