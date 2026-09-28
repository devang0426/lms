import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { QuizAttempt, QuizQuestion } from "@/lib/ai/types";
import { masteryByTopic, masteryColor } from "@/lib/study/mastery";
import {
  correctAnswerText,
  isCorrect,
  type AnswerFeedback,
  type PracticeQuestion,
  type QuestionView,
  type QuizLevel,
  type GradedQuizSummary,
  type TopicMasteryView,
} from "@/lib/study/quiz";
import { db } from "./client";
import { gradedQuizzes, quizAnswers, quizAttempts, quizQuestions, type GradedQuiz } from "./schema";

/* Quizzes and mastery (feature 16). Callers check the lesson first
   (getLessonForUser for students, course staff for instructors); every
   attempt query here is also scoped to its user. Answers are always
   scored here, from the stored questions — never trusted from the client.
   A graded quiz's correct answers leave the server only after its
   attempt is submitted. */

export interface SubmittedAnswer {
  questionId: string;
  answer: string;
}

/* ---- Practice -------------------------------------------------------------- */

const practiceBank = (lessonId: string, publishedOnly: boolean) =>
  and(
    eq(quizQuestions.lessonId, lessonId),
    eq(quizQuestions.bank, "practice"),
    publishedOnly ? eq(quizQuestions.status, "published") : undefined,
  );

export async function practiceQuestions(lessonId: string, level: QuizLevel, publishedOnly: boolean): Promise<PracticeQuestion[]> {
  return db
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      difficulty: quizQuestions.difficulty,
      topic: quizQuestions.topic,
      question: quizQuestions.question,
      options: quizQuestions.options,
      startSec: quizQuestions.startSec,
      correctIndex: quizQuestions.correctIndex,
      explanation: quizQuestions.explanation,
    })
    .from(quizQuestions)
    .where(and(practiceBank(lessonId, publishedOnly), eq(quizQuestions.difficulty, level)))
    .orderBy(asc(quizQuestions.position));
}

/* Practice questions per level, for the difficulty picker. */
export async function practiceLevelCounts(lessonId: string, publishedOnly: boolean): Promise<Record<QuizLevel, number>> {
  const rows = await db
    .select({ level: quizQuestions.difficulty, n: sql<number>`count(*)`.mapWith(Number) })
    .from(quizQuestions)
    .where(practiceBank(lessonId, publishedOnly))
    .groupBy(quizQuestions.difficulty);
  const counts: Record<QuizLevel, number> = { basic: 0, intermediate: 0, exam: 0 };
  for (const r of rows) counts[r.level] = r.n;
  return counts;
}

/* Save a finished practice set: one attempt with its answers, scored here. */
export async function savePracticeAttempt(userId: string, lessonId: string, answers: SubmittedAnswer[]): Promise<{ score: number } | null> {
  const ids = [...new Set(answers.map((a) => a.questionId))];
  if (ids.length === 0) return null;
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(and(practiceBank(lessonId, true), inArray(quizQuestions.id, ids)));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const scored = answers
    .filter((a, i) => byId.has(a.questionId) && answers.findIndex((b) => b.questionId === a.questionId) === i)
    .map((a) => ({ ...a, correct: isCorrect(byId.get(a.questionId)!, a.answer) }));
  if (scored.length === 0) return null;

  const score = scored.filter((a) => a.correct).length / scored.length;
  const attemptId = crypto.randomUUID();
  await db.batch([
    db.insert(quizAttempts).values({ id: attemptId, userId, lessonId, mode: "practice", submittedAt: new Date(), score }),
    db.insert(quizAnswers).values(scored.map((a) => ({ attemptId, questionId: a.questionId, answer: a.answer, correct: a.correct }))),
  ]);
  return { score };
}

/* ---- Graded ---------------------------------------------------------------- */

export async function gradedQuizzesForStudent(userId: string, lessonId: string): Promise<GradedQuizSummary[]> {
  const rows = await db
    .select({
      quiz: gradedQuizzes,
      attemptsUsed: sql<number>`(select count(*) from quiz_attempts a
        where a.graded_quiz_id = graded_quizzes.id and a.user_id = ${userId})`.mapWith(Number),
      best: sql<number | null>`(select max(a.score) from quiz_attempts a
        where a.graded_quiz_id = graded_quizzes.id and a.user_id = ${userId} and a.submitted_at is not null)`,
      openAttemptId: sql<string | null>`(select a.id from quiz_attempts a
        where a.graded_quiz_id = graded_quizzes.id and a.user_id = ${userId} and a.submitted_at is null
        order by a.started_at desc limit 1)`,
    })
    .from(gradedQuizzes)
    .where(eq(gradedQuizzes.lessonId, lessonId))
    .orderBy(asc(gradedQuizzes.dueAt));
  return rows.map(({ quiz, attemptsUsed, best, openAttemptId }) => ({
    id: quiz.id,
    title: quiz.title,
    dueAt: quiz.dueAt.getTime(),
    points: quiz.points,
    maxAttempts: quiz.maxAttempts,
    questionCount: quiz.questionIds.length,
    attemptsUsed,
    best: best === null ? null : Number(best),
    openAttemptId,
  }));
}

/* The questions a student sees for a graded attempt: no answers. */
async function questionViews(quiz: Pick<GradedQuiz, "questionIds" | "lessonId">): Promise<QuestionView[]> {
  if (quiz.questionIds.length === 0) return [];
  const rows = await db
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      difficulty: quizQuestions.difficulty,
      topic: quizQuestions.topic,
      question: quizQuestions.question,
      options: quizQuestions.options,
      startSec: quizQuestions.startSec,
    })
    .from(quizQuestions)
    .where(and(eq(quizQuestions.lessonId, quiz.lessonId), inArray(quizQuestions.id, quiz.questionIds)));
  const order = new Map(quiz.questionIds.map((id, i) => [id, i]));
  return rows
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    // A fill-in-the-blank's only option is its answer.
    .map((q) => (q.type === "fill_blank" ? { ...q, options: [] } : q));
}

export type StartResult =
  | { ok: true; attemptId: string; questions: QuestionView[] }
  | { ok: false; reason: "not_found" | "closed" | "limit" | "empty" };

/* Start (or resume) a graded attempt. A new attempt is created in one
   statement that checks the due date and the attempt limit. */
export async function startGradedAttempt(userId: string, lessonId: string, quizId: string): Promise<StartResult> {
  const [quiz] = await db
    .select()
    .from(gradedQuizzes)
    .where(and(eq(gradedQuizzes.id, quizId), eq(gradedQuizzes.lessonId, lessonId)))
    .limit(1);
  if (!quiz) return { ok: false, reason: "not_found" };
  const questions = await questionViews(quiz);
  if (questions.length === 0) return { ok: false, reason: "empty" };

  const [open] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.gradedQuizId, quizId), eq(quizAttempts.userId, userId), isNull(quizAttempts.submittedAt)))
    .orderBy(desc(quizAttempts.startedAt))
    .limit(1);
  if (open) {
    if (quiz.dueAt.getTime() <= Date.now()) return { ok: false, reason: "closed" };
    return { ok: true, attemptId: open.id, questions };
  }

  const { rows } = await db.execute<{ id: string }>(sql`
    insert into quiz_attempts (user_id, lesson_id, mode, graded_quiz_id)
    select ${userId}, gq.lesson_id, 'graded', gq.id from graded_quizzes gq
    where gq.id = ${quizId} and gq.due_at > now()
      and (select count(*) from quiz_attempts a where a.graded_quiz_id = gq.id and a.user_id = ${userId}) < gq.max_attempts
    returning id`);
  if (rows[0]) return { ok: true, attemptId: rows[0].id, questions };
  return { ok: false, reason: quiz.dueAt.getTime() <= Date.now() ? "closed" : "limit" };
}

export type SubmitResult =
  | { ok: true; score: number; feedback: AnswerFeedback[] }
  | { ok: false; reason: "not_found" | "submitted" | "closed" };

/* Score and close the student's open attempt. Only now do the correct
   answers and explanations go back. */
export async function submitGradedAttempt(userId: string, attemptId: string, answers: SubmittedAnswer[]): Promise<SubmitResult> {
  const [row] = await db
    .select({ attempt: quizAttempts, quiz: gradedQuizzes })
    .from(quizAttempts)
    .innerJoin(gradedQuizzes, eq(gradedQuizzes.id, quizAttempts.gradedQuizId))
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId), eq(quizAttempts.mode, "graded")))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.attempt.submittedAt) return { ok: false, reason: "submitted" };
  // Started before the due date (checked when it began); a late start can't exist.
  if (row.attempt.startedAt.getTime() >= row.quiz.dueAt.getTime()) return { ok: false, reason: "closed" };

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.lessonId, row.quiz.lessonId), inArray(quizQuestions.id, row.quiz.questionIds)));
  if (questions.length === 0) return { ok: false, reason: "not_found" };
  const given = new Map(answers.map((a) => [a.questionId, a.answer]));
  // Every question counts; one left blank is wrong.
  const scored = questions.map((q) => {
    const answer = given.get(q.id) ?? "";
    return { q, answer, correct: answer.trim() !== "" && isCorrect(q, answer) };
  });
  const score = scored.filter((s) => s.correct).length / scored.length;

  const [, closed] = await db.batch([
    db
      .insert(quizAnswers)
      .values(scored.map((s) => ({ attemptId, questionId: s.q.id, answer: s.answer, correct: s.correct })))
      .onConflictDoNothing(),
    db
      .update(quizAttempts)
      .set({ submittedAt: new Date(), score })
      .where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.submittedAt)))
      .returning({ id: quizAttempts.id }),
  ]);
  if (closed.length === 0) return { ok: false, reason: "submitted" };

  const order = new Map(row.quiz.questionIds.map((id, i) => [id, i]));
  const feedback = scored
    .sort((a, b) => order.get(a.q.id)! - order.get(b.q.id)!)
    .map((s) => ({
      questionId: s.q.id,
      answer: s.answer,
      correct: s.correct,
      correctAnswer: correctAnswerText(s.q),
      explanation: s.q.explanation,
      startSec: s.q.startSec,
    }));
  return { ok: true, score, feedback };
}

/* ---- Mastery --------------------------------------------------------------- */

export type { TopicMasteryView };

/* Mastery per topic over everything the student has submitted for this
   lesson (practice and graded), via lib/study/mastery.ts. */
export async function lessonMastery(userId: string, lessonId: string): Promise<TopicMasteryView[]> {
  const [questions, answers] = await db.batch([
    db
      .select({ id: quizQuestions.id, topic: quizQuestions.topic, startSec: quizQuestions.startSec, difficulty: quizQuestions.difficulty })
      .from(quizQuestions)
      .where(and(eq(quizQuestions.lessonId, lessonId), eq(quizQuestions.status, "published"))),
    db
      .select({ questionId: quizAnswers.questionId, correct: quizAnswers.correct, at: quizAttempts.submittedAt })
      .from(quizAnswers)
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
      .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId), sql`${quizAttempts.submittedAt} is not null`)),
  ]);
  const named = questions.map((q) => ({ ...q, topic: q.topic.trim() || "General" }));
  const topicOf = new Map(named.map((q) => [q.id, q.topic]));
  const asQuestions: QuizQuestion[] = named.map((q) => ({
    id: q.id,
    noteId: "",
    type: "mcq",
    topic: q.topic,
    difficulty: q.difficulty,
    question: "",
    options: [],
    correctIndex: 0,
    explanation: "",
  }));
  const asAttempts: QuizAttempt[] = answers
    .filter((a) => topicOf.has(a.questionId))
    .map((a, i) => ({ id: String(i), noteId: "", questionId: a.questionId, topic: topicOf.get(a.questionId)!, correct: a.correct, at: a.at?.getTime() ?? 0 }));
  const firstTaught = new Map<string, number>();
  for (const q of named) {
    if (q.startSec === null) continue;
    firstTaught.set(q.topic, Math.min(firstTaught.get(q.topic) ?? Infinity, q.startSec));
  }
  return masteryByTopic(asQuestions, asAttempts).map((m) => ({
    ...m,
    tone: masteryColor(m.pct),
    startSec: firstTaught.get(m.topic) ?? null,
  }));
}

/* ---- Instructor ------------------------------------------------------------ */

export async function questionBank(lessonId: string) {
  return db
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      difficulty: quizQuestions.difficulty,
      topic: quizQuestions.topic,
      question: quizQuestions.question,
      bank: quizQuestions.bank,
      status: quizQuestions.status,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lessonId))
    .orderBy(sql`case ${quizQuestions.difficulty} when 'basic' then 0 when 'intermediate' then 1 else 2 end`, asc(quizQuestions.position));
}

export async function gradedQuizzesForStaff(lessonId: string) {
  return db
    .select({
      quiz: gradedQuizzes,
      submissions: sql<number>`(select count(*) from quiz_attempts a
        where a.graded_quiz_id = graded_quizzes.id and a.submitted_at is not null)`.mapWith(Number),
    })
    .from(gradedQuizzes)
    .where(eq(gradedQuizzes.lessonId, lessonId))
    .orderBy(asc(gradedQuizzes.dueAt));
}

/* The quiz insert and the move of its questions to the graded bank, as
   statements for the caller's batch (with its audit row). Returns null if
   any id isn't a question of this lesson. */
export async function createGradedQuizStatements(input: {
  lessonId: string;
  title: string;
  questionIds: string[];
  dueAt: Date;
  maxAttempts: number;
  points: number;
  createdBy: string;
}) {
  const found = await db
    .select({ id: quizQuestions.id })
    .from(quizQuestions)
    .where(and(eq(quizQuestions.lessonId, input.lessonId), inArray(quizQuestions.id, input.questionIds)));
  if (found.length !== new Set(input.questionIds).size) return null;
  const id = crypto.randomUUID();
  return {
    id,
    statements: [
      db.insert(gradedQuizzes).values({ id, ...input }),
      db
        .update(quizQuestions)
        .set({ bank: "graded" })
        .where(and(eq(quizQuestions.lessonId, input.lessonId), inArray(quizQuestions.id, input.questionIds))),
    ] as const,
  };
}

/* ---- The player's Quiz tab --------------------------------------------------- */

export interface QuizTabData {
  levelCounts: Record<QuizLevel, number>;
  graded: GradedQuizSummary[];
  mastery: TopicMasteryView[];
}

/* Everything the tab shows before a quiz starts, in parallel. No question
   text or answers: those load when a quiz starts. Staff preview sees the
   graded list without attempts, and no mastery. */
export async function quizTabData(userId: string, lessonId: string, preview: boolean): Promise<QuizTabData> {
  const [levelCounts, graded, mastery] = await Promise.all([
    practiceLevelCounts(lessonId, !preview),
    preview
      ? gradedQuizzesForStaff(lessonId).then((rows) =>
          rows.map(({ quiz }) => ({
            id: quiz.id,
            title: quiz.title,
            dueAt: quiz.dueAt.getTime(),
            points: quiz.points,
            maxAttempts: quiz.maxAttempts,
            questionCount: quiz.questionIds.length,
            attemptsUsed: 0,
            best: null,
            openAttemptId: null,
          })),
        )
      : gradedQuizzesForStudent(userId, lessonId),
    preview ? Promise.resolve([]) : lessonMastery(userId, lessonId),
  ]);
  return { levelCounts, graded, mastery };
}
