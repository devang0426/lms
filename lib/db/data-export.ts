import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { ExportRows } from "@/lib/account/export-document";
import { EXPORT_DAILY_LIMIT, exportExpiresAt } from "@/lib/account/rules";
import { auditInsert } from "./audit";
import { db } from "./client";
import { isUuid } from "./courses";
import { lockFor, underLimit } from "./limits";
import {
  cardReviews,
  chatThreads,
  chatTurns,
  courses,
  dataExports,
  discussionReplies,
  discussions,
  documents,
  enrollments,
  flashcards,
  gradedQuizzes,
  grades,
  jobs,
  lessonNotes,
  lessons,
  modules,
  notes,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  sections,
  submissions,
  assignments,
  users,
  watchProgress,
  type DataExport,
  type Job,
} from "./schema";

/* Data export (feature 33). Every read is the person's own: the owner is
   in each query, with no staff or admin override. Callers pass the
   signed-in user's id (the Profile page and its action) or the export
   row's owner (the export-user-data task). */

/* ---- The export rows -------------------------------------------------------- */

/* Ask for an export: the daily limit is counted and the row written in
   one locked batch, so parallel clicks can't pass it (isLimitError on a
   refusal). The audit row carries ids only. */
export async function createExportRequest(userId: string, now = new Date()): Promise<DataExport> {
  const recent = sql`select count(*) from data_exports where user_id = ${userId} and created_at > now() - interval '24 hours'`;
  const [, , [row]] = await db.batch([
    lockFor("export", userId),
    underLimit(recent, EXPORT_DAILY_LIMIT, "data exports"),
    db.insert(dataExports).values({ userId, expiresAt: exportExpiresAt(now) }).returning(),
    auditInsert({ actorId: userId, action: "user.export_requested", entityType: "user", entityId: userId }),
  ]);
  return row;
}

/* The person's newest export, with the newest run that builds it (the
   Profile page reconciles the run, then works out the phase). */
export async function latestExportFor(userId: string): Promise<{ row: DataExport; job: Job | null } | null> {
  const [rows, jobRows] = await db.batch([
    db.select().from(dataExports).where(eq(dataExports.userId, userId)).orderBy(desc(dataExports.createdAt), desc(dataExports.id)).limit(1),
    db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.entityType, "export"),
          eq(jobs.kind, "export-user-data"),
          sql`${jobs.entityId} = (select e.id::text from data_exports e where e.user_id = ${userId} order by e.created_at desc, e.id desc limit 1)`,
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1),
  ]);
  const row = rows[0];
  return row ? { row, job: jobRows[0] ?? null } : null;
}

/* The download route: the owner's ready file, until it expires. */
export async function ownedReadyExport(exportId: string, userId: string, now = new Date()): Promise<Pick<DataExport, "blobUrl"> | null> {
  if (!isUuid(exportId)) return null;
  const [row] = await db
    .select({ blobUrl: dataExports.blobUrl })
    .from(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId), eq(dataExports.status, "ready"), gt(dataExports.expiresAt, now)))
    .limit(1);
  return row?.blobUrl ? row : null;
}

/* The task's reads and writes (it runs as the system). */
export async function exportForTask(exportId: string): Promise<(DataExport & { deleted: boolean }) | null> {
  const [row] = await db
    .select({ export: dataExports, deletedAt: users.deletedAt })
    .from(dataExports)
    .innerJoin(users, eq(users.id, dataExports.userId))
    .where(eq(dataExports.id, exportId))
    .limit(1);
  return row ? { ...row.export, deleted: row.deletedAt !== null } : null;
}

/* False when the row is gone (its owner was erased meanwhile). */
export async function markExportReady(exportId: string, file: { url: string; pathname: string; size: number }): Promise<boolean> {
  const updated = await db
    .update(dataExports)
    .set({ status: "ready", blobUrl: file.url, pathname: file.pathname, sizeBytes: file.size, readyAt: new Date(), error: null })
    .where(eq(dataExports.id, exportId))
    .returning({ id: dataExports.id });
  return updated.length > 0;
}

/* Only a row still being built: a retry that finished first stays ready. */
export async function markExportFailed(exportId: string, message: string): Promise<void> {
  await db
    .update(dataExports)
    .set({ status: "failed", error: message })
    .where(and(eq(dataExports.id, exportId), eq(dataExports.status, "building")));
}

/* ---- Expiry (the daily prune-old-rows) -------------------------------------- */

/* Exports past their 7 days, oldest first. Their files are deleted before
   the rows (deleteExportRows), so a failed file delete leaves the row for
   the next run to try again. */
export async function expiredExports(now: Date, limit = 200): Promise<{ id: string; blobUrl: string | null }[]> {
  return db
    .select({ id: dataExports.id, blobUrl: dataExports.blobUrl })
    .from(dataExports)
    .where(lte(dataExports.expiresAt, now))
    .orderBy(asc(dataExports.expiresAt))
    .limit(limit);
}

export async function deleteExportRows(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (await db.delete(dataExports).where(inArray(dataExports.id, ids)).returning({ id: dataExports.id })).length;
}

/* ---- What goes in the file ---------------------------------------------------- */

/* The course code and lesson title of a lesson row joined in. */
const lessonCourse = {
  courseCode: courses.code,
  lesson: lessons.title,
};

/* Everything the export lists, for one person, in one batch. Grades come
   only once returned to the student (a draft is staff-only). */
export function userExportQueries(userId: string) {
  return [
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        courseCode: courses.code,
        courseTitle: courses.title,
        section: sections.name,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(courses, eq(courses.id, sections.courseId))
      .where(eq(enrollments.userId, userId))
      .orderBy(asc(enrollments.enrolledAt)),
    db
      .select({
        ...lessonCourse,
        positionSec: watchProgress.positionSec,
        watchedRanges: watchProgress.watchedRanges,
        completedAt: watchProgress.completedAt,
        updatedAt: watchProgress.updatedAt,
      })
      .from(watchProgress)
      .innerJoin(lessons, eq(lessons.id, watchProgress.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(eq(watchProgress.userId, userId))
      .orderBy(asc(watchProgress.updatedAt)),
    db
      .select({ ...lessonCourse, atSec: lessonNotes.atSec, text: lessonNotes.text, createdAt: lessonNotes.createdAt })
      .from(lessonNotes)
      .innerJoin(lessons, eq(lessons.id, lessonNotes.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(eq(lessonNotes.userId, userId))
      .orderBy(asc(lessonNotes.createdAt)),
    db
      .select({
        front: flashcards.front,
        back: flashcards.back,
        courseCode: courses.code,
        lesson: lessons.title,
        note: notes.title,
        state: cardReviews.state,
        due: cardReviews.due,
        stability: cardReviews.stability,
        difficulty: cardReviews.difficulty,
        reps: cardReviews.reps,
        lapses: cardReviews.lapses,
        lastReview: cardReviews.lastReview,
      })
      .from(cardReviews)
      .innerJoin(flashcards, eq(flashcards.id, cardReviews.cardId))
      .leftJoin(lessons, eq(lessons.id, flashcards.lessonId))
      .leftJoin(modules, eq(modules.id, lessons.moduleId))
      .leftJoin(courses, eq(courses.id, modules.courseId))
      .leftJoin(notes, eq(notes.id, flashcards.noteId))
      .where(eq(cardReviews.userId, userId))
      .orderBy(asc(cardReviews.due)),
    db
      .select({
        id: quizAttempts.id,
        mode: quizAttempts.mode,
        courseCode: courses.code,
        lesson: lessons.title,
        note: notes.title,
        gradedQuiz: gradedQuizzes.title,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        score: quizAttempts.score,
      })
      .from(quizAttempts)
      .leftJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
      .leftJoin(modules, eq(modules.id, lessons.moduleId))
      .leftJoin(courses, eq(courses.id, modules.courseId))
      .leftJoin(notes, eq(notes.id, quizAttempts.noteId))
      .leftJoin(gradedQuizzes, eq(gradedQuizzes.id, quizAttempts.gradedQuizId))
      .where(eq(quizAttempts.userId, userId))
      .orderBy(asc(quizAttempts.startedAt)),
    // Their answers only: which option they chose and whether it was right,
    // never the answer key.
    db
      .select({
        attemptId: quizAnswers.attemptId,
        question: quizQuestions.question,
        options: quizQuestions.options,
        answer: quizAnswers.answer,
        correct: quizAnswers.correct,
      })
      .from(quizAnswers)
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
      .innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId))
      .where(eq(quizAttempts.userId, userId))
      .orderBy(asc(quizAttempts.startedAt), asc(quizQuestions.position)),
    db
      .select({
        id: submissions.id,
        courseCode: courses.code,
        assignment: lessons.title,
        text: submissions.text,
        files: submissions.files,
        submittedAt: submissions.submittedAt,
        late: submissions.late,
        status: submissions.status,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(eq(submissions.userId, userId))
      .orderBy(asc(submissions.submittedAt)),
    db
      .select({
        courseCode: courses.code,
        item: lessons.title,
        score: grades.score,
        maxScore: grades.maxScore,
        feedback: grades.feedback,
        gradedAt: grades.gradedAt,
      })
      .from(grades)
      .leftJoin(submissions, eq(submissions.id, grades.submissionId))
      .leftJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .leftJoin(lessons, eq(lessons.id, assignments.lessonId))
      .leftJoin(modules, eq(modules.id, lessons.moduleId))
      .leftJoin(courses, eq(courses.id, modules.courseId))
      .where(and(eq(grades.userId, userId), or(isNull(grades.submissionId), eq(submissions.status, "returned"))))
      .orderBy(asc(grades.gradedAt)),
    db
      .select({
        courseCode: courses.code,
        lesson: lessons.title,
        title: discussions.title,
        body: discussions.body,
        status: discussions.status,
        createdAt: discussions.createdAt,
      })
      .from(discussions)
      .innerJoin(courses, eq(courses.id, discussions.courseId))
      .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
      .where(eq(discussions.authorId, userId))
      .orderBy(asc(discussions.createdAt)),
    db
      .select({
        courseCode: courses.code,
        thread: discussions.title,
        body: discussionReplies.body,
        isAnswer: discussionReplies.isAnswer,
        createdAt: discussionReplies.createdAt,
      })
      .from(discussionReplies)
      .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
      .innerJoin(courses, eq(courses.id, discussions.courseId))
      .where(eq(discussionReplies.authorId, userId))
      .orderBy(asc(discussionReplies.createdAt)),
    db
      .select({ id: notes.id, title: notes.title, blocks: notes.blocks, createdAt: notes.createdAt, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.ownerId, userId))
      .orderBy(asc(notes.createdAt)),
    db
      .select({
        id: documents.id,
        noteId: documents.noteId,
        kind: documents.kind,
        title: documents.title,
        filename: documents.filename,
        url: documents.url,
        hasFile: sql<boolean>`${documents.blobUrl} is not null`,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.ownerId, userId))
      .orderBy(asc(documents.createdAt)),
    db
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        courseCode: courses.code,
        lesson: lessons.title,
        note: notes.title,
        createdAt: chatThreads.createdAt,
      })
      .from(chatThreads)
      .leftJoin(courses, eq(courses.id, chatThreads.courseId))
      .leftJoin(lessons, eq(lessons.id, chatThreads.lessonId))
      .leftJoin(notes, eq(notes.id, chatThreads.noteId))
      .where(eq(chatThreads.userId, userId))
      .orderBy(asc(chatThreads.createdAt)),
    db
      .select({
        threadId: chatTurns.threadId,
        role: chatTurns.role,
        content: chatTurns.content,
        refused: chatTurns.refused,
        citations: chatTurns.citations,
        createdAt: chatTurns.createdAt,
      })
      .from(chatTurns)
      .innerJoin(chatThreads, eq(chatThreads.id, chatTurns.threadId))
      .where(eq(chatThreads.userId, userId))
      .orderBy(asc(chatTurns.createdAt), asc(chatTurns.id)),
  ] as const;
}

/* The rows for buildExportDocument, or null when the person is gone. */
export async function loadUserExportRows(userId: string): Promise<ExportRows | null> {
  const [
    profile,
    enrollmentRows,
    watchRows,
    lessonNoteRows,
    cardRows,
    attemptRows,
    answerRows,
    submissionRows,
    gradeRows,
    discussionRows,
    replyRows,
    noteRows,
    documentRows,
    threadRows,
    turnRows,
  ] = await db.batch(userExportQueries(userId));
  if (!profile[0]) return null;
  return {
    profile: profile[0],
    enrollments: enrollmentRows,
    watchProgress: watchRows,
    lessonNotes: lessonNoteRows,
    cardReviews: cardRows,
    quizAttempts: attemptRows,
    quizAnswers: answerRows,
    submissions: submissionRows,
    grades: gradeRows,
    discussions: discussionRows,
    replies: replyRows,
    privateNotes: noteRows,
    privateDocuments: documentRows,
    chatThreads: threadRows,
    chatTurns: turnRows,
  };
}
