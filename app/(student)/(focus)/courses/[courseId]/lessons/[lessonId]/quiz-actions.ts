"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import {
  lessonMastery,
  practiceQuestions,
  reviewGradedAttempt,
  savePracticeAttempt,
  startGradedAttempt,
  submitGradedAttempt,
} from "@/lib/db/quizzes";
import type { AnswerFeedback, PracticeQuestion, QuestionView, TopicMasteryView } from "@/lib/study/quiz";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* Quiz actions for the lesson player (feature 16). Each: zod → the lesson
   must be visible to this user (getLessonForUser, in SQL) → work. Staff
   previewing a lesson can practise but nothing is saved, and they can't
   take graded quizzes. Every answer is scored on the server. */

const lessonId = z.uuid();
const level = z.enum(["basic", "intermediate", "exam"]);
const answers = z
  .array(z.object({ questionId: z.uuid(), answer: z.string().max(500) }))
  .max(100);

async function access(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: fail("unauthorized", "Your session has ended. Sign in again.") };
  const found = await getLessonForUser(id, user);
  if (!found) return { error: fail("not_found", "That lesson isn't available.") };
  return { user, preview: found.access === "staff" };
}

export const loadPractice = safeAction("loadPractice", async (input: { lessonId: string; level: string }): Promise<ActionResult<PracticeQuestion[]>> => {
  const parsed = z.object({ lessonId, level }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Pick a difficulty.");
  const a = await access(parsed.data.lessonId);
  if ("error" in a) return a.error!;
  return ok(await practiceQuestions(parsed.data.lessonId, parsed.data.level, !a.preview));
});

export const savePractice = safeAction("savePractice", async (input: {
  lessonId: string;
  answers: z.input<typeof answers>;
}): Promise<ActionResult<{ score: number | null; mastery: TopicMasteryView[] }>> => {
  const parsed = z.object({ lessonId, answers }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Those answers couldn't be saved.");
  const a = await access(parsed.data.lessonId);
  if ("error" in a) return a.error!;
  if (a.preview) return ok({ score: null, mastery: [] });
  const saved = await savePracticeAttempt(a.user.id, parsed.data.lessonId, parsed.data.answers);
  return ok({ score: saved?.score ?? null, mastery: await lessonMastery(a.user.id, parsed.data.lessonId) });
});

const START_MESSAGES = {
  not_found: "That quiz isn't available.",
  closed: "This quiz is closed: its due date has passed.",
  limit: "You've used all your attempts for this quiz.",
  empty: "This quiz has no questions. Let your instructor know.",
} as const;

export const startGraded = safeAction("startGraded", async (input: {
  lessonId: string;
  quizId: string;
}): Promise<ActionResult<{ attemptId: string; questions: QuestionView[] }>> => {
  const parsed = z.object({ lessonId, quizId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid", "That quiz isn't available.");
  const a = await access(parsed.data.lessonId);
  if ("error" in a) return a.error!;
  if (a.preview) return fail("conflict", "This is a preview. Students take graded quizzes here.");
  const result = await startGradedAttempt(a.user.id, parsed.data.lessonId, parsed.data.quizId);
  if (!result.ok) return fail(result.reason === "not_found" ? "not_found" : "conflict", START_MESSAGES[result.reason]);
  return ok({ attemptId: result.attemptId, questions: result.questions });
});

const SUBMIT_MESSAGES = {
  not_found: "That attempt isn't available.",
  submitted: "This attempt was already submitted.",
  closed: "This quiz is closed: its due date has passed, so this attempt can't be submitted.",
} as const;

export const submitGraded = safeAction("submitGraded", async (input: {
  lessonId: string;
  attemptId: string;
  answers: z.input<typeof answers>;
}): Promise<ActionResult<{ score: number; feedback: AnswerFeedback[]; mastery: TopicMasteryView[] }>> => {
  const parsed = z.object({ lessonId, attemptId: z.uuid(), answers }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Those answers couldn't be submitted.");
  const a = await access(parsed.data.lessonId);
  if ("error" in a) return a.error!;
  if (a.preview) return fail("conflict", "This is a preview. Students take graded quizzes here.");
  const result = await submitGradedAttempt(a.user.id, parsed.data.lessonId, parsed.data.attemptId, parsed.data.answers);
  if (!result.ok) return fail(result.reason === "not_found" ? "not_found" : "conflict", SUBMIT_MESSAGES[result.reason]);
  return ok({ score: result.score, feedback: result.feedback, mastery: await lessonMastery(a.user.id, parsed.data.lessonId) });
});

const REVIEW_MESSAGES = {
  not_found: "That quiz isn't available.",
  not_yet: "Answers are shown after the due date.",
  no_attempt: "You didn't submit an attempt for this quiz.",
} as const;

/* A graded quiz's answers, once revealed (feature 24): the student's best attempt. */
export const reviewGraded = safeAction("reviewGraded", async (input: {
  lessonId: string;
  quizId: string;
}): Promise<ActionResult<{ score: number; questions: QuestionView[]; feedback: AnswerFeedback[] }>> => {
  const parsed = z.object({ lessonId, quizId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid", "That quiz isn't available.");
  const a = await access(parsed.data.lessonId);
  if ("error" in a) return a.error!;
  if (a.preview) return fail("conflict", "This is a preview. Students review their graded quizzes here.");
  const result = await reviewGradedAttempt(a.user.id, parsed.data.lessonId, parsed.data.quizId);
  if (!result.ok) return fail(result.reason === "not_found" ? "not_found" : "conflict", REVIEW_MESSAGES[result.reason]);
  return ok({ score: result.score, questions: result.questions, feedback: result.feedback });
});
