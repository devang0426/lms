import "server-only";

import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { submitCheck } from "@/lib/coursework/rules";
import { MAX_SUBMISSION_FILES } from "@/lib/storage/upload-kinds";
import { db } from "./client";
import { enrolledPredicate, staffPredicate, type Viewer } from "./courses";
import {
  assignments,
  courses,
  grades,
  lessons,
  modules,
  quizAttempts,
  submissions,
  type Assignment,
  type AssignmentCategory,
  type Grade,
  type Submission,
  type SubmissionFile,
} from "./schema";

/* Assignments and submissions (feature 20). Staff writes come from the
   lesson editor's action (course staff checked there). A student reaches
   an assignment only through its lesson: enrolled, with the course, module
   and lesson published — checked in the SQL below. A student only ever
   reads their own submission; staff read any in their courses. */

export async function getAssignment(lessonId: string): Promise<Assignment | null> {
  const [row] = await db.select().from(assignments).where(eq(assignments.lessonId, lessonId)).limit(1);
  return row ?? null;
}

/* The upsert for the lesson editor's save, for the caller's batch. */
export function saveAssignmentStatement(input: {
  lessonId: string;
  instructions: string;
  dueAt: Date;
  points: number;
  allowLate: boolean;
  category: AssignmentCategory;
  createdBy: string;
}) {
  const { createdBy, lessonId, ...fields } = input;
  return db
    .insert(assignments)
    .values({ lessonId, createdBy, ...fields })
    .onConflictDoUpdate({ target: assignments.lessonId, set: fields });
}

/* The assignment, if this viewer is a student who can see its lesson.
   Course staff (and admins) are never students here: they don't hand in. */
async function assignmentForStudent(assignmentId: string, viewer: Viewer): Promise<Assignment | null> {
  if (viewer.role === "admin") return null;
  const [row] = await db
    .select({ assignment: assignments })
    .from(assignments)
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(courses.status, "published"),
        eq(modules.status, "published"),
        eq(lessons.status, "published"),
        enrolledPredicate(viewer),
        sql`not ${staffPredicate(viewer)}`,
      ),
    )
    .limit(1);
  return row?.assignment ?? null;
}

async function ownSubmission(userId: string, assignmentId: string): Promise<Submission | null> {
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/* For the upload token: may this student put a file in their folder for
   this assignment right now? The hand-in re-checks everything. */
export async function canSubmitTo(assignmentId: string, viewer: Viewer): Promise<boolean> {
  const assignment = await assignmentForStudent(assignmentId, viewer);
  if (!assignment) return false;
  const own = await ownSubmission(viewer.id, assignmentId);
  return submitCheck({ dueAt: assignment.dueAt.getTime(), allowLate: assignment.allowLate, status: own?.status ?? null }, Date.now()).ok;
}

export interface StudentWork {
  assignment: Assignment;
  submission: Submission | null;
  /* Only once the grade is returned: a draft grade stays with staff. */
  grade: Pick<Grade, "score" | "maxScore" | "feedback" | "gradedAt"> | null;
}

/* The student's view of an assignment lesson. Call after getLessonForUser
   has let them into the lesson. */
export async function studentWork(userId: string, lessonId: string): Promise<StudentWork | null> {
  const assignment = await getAssignment(lessonId);
  if (!assignment) return null;
  const [row] = await db
    .select({ submission: submissions, grade: { score: grades.score, maxScore: grades.maxScore, feedback: grades.feedback, gradedAt: grades.gradedAt } })
    .from(submissions)
    .leftJoin(grades, eq(grades.submissionId, submissions.id))
    .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.userId, userId)))
    .limit(1);
  const submission = row?.submission ?? null;
  const grade = submission?.status === "returned" && row?.grade?.score != null ? row.grade : null;
  return { assignment, submission, grade: grade as StudentWork["grade"] };
}

export type HandInResult =
  | { ok: true; submissionId: string; late: boolean; replaced: SubmissionFile[] }
  | { ok: false; reason: "not_found" | "locked" | "closed" | "empty" | "too_many" };

/* Hand in (or replace) the student's work. The upsert only inserts while
   the assignment takes work (before the due date, or late work allowed),
   only replaces a submission that isn't graded yet, and flags it late by
   the database clock. Its audit row is in the same transaction and is
   written only if the upsert was: in one transaction now() doesn't move,
   so a row whose submitted_at is now() is the one just saved.
   `keep` picks files of the current version by index (the page never sees
   their URLs); `add` are new files the caller has checked. Returns the
   files the new version no longer has, for the caller to delete. */
export async function handInWork(
  viewer: Viewer,
  assignmentId: string,
  work: { text: string; keep: number[]; add: SubmissionFile[] },
): Promise<HandInResult> {
  const assignment = await assignmentForStudent(assignmentId, viewer);
  if (!assignment) return { ok: false, reason: "not_found" };
  const before = await ownSubmission(viewer.id, assignmentId);
  const kept = [...new Set(work.keep)].flatMap((i) => (before?.files[i] ? [before.files[i]] : []));
  const files = [...kept, ...work.add];
  if (files.length > MAX_SUBMISSION_FILES) return { ok: false, reason: "too_many" };
  if (files.length === 0 && work.text.trim() === "") return { ok: false, reason: "empty" };

  const [saved] = await db.batch([
    db.execute<{ id: string; late: boolean }>(sql`
      insert into submissions (assignment_id, user_id, text, files, submitted_at, late, status)
      select a.id, ${viewer.id}, ${work.text}, ${JSON.stringify(files)}::jsonb, now(), now() > a.due_at, 'submitted'
      from assignments a
      where a.id = ${assignmentId} and (a.allow_late or now() <= a.due_at)
      on conflict (assignment_id, user_id) do update
        set text = excluded.text, files = excluded.files, submitted_at = excluded.submitted_at,
            late = excluded.late, updated_at = now()
        where submissions.status = 'submitted'
      returning id, late`),
    db.execute(sql`
      insert into audit_log (actor_id, action, entity_type, entity_id, data)
      select ${viewer.id}, ${before ? "submission.replace" : "submission.hand_in"}, 'submission', s.id::text,
        jsonb_build_object('assignmentId', s.assignment_id, 'late', s.late, 'files', jsonb_array_length(s.files))
      from submissions s
      where s.assignment_id = ${assignmentId} and s.user_id = ${viewer.id} and s.submitted_at = now()`),
  ]);
  const row = saved.rows[0];
  if (!row) {
    const locked = before !== null && before.status !== "submitted";
    return { ok: false, reason: locked ? "locked" : "closed" };
  }
  const still = new Set(files.map((f) => f.pathname));
  return { ok: true, submissionId: row.id, late: row.late, replaced: (before?.files ?? []).filter((f) => !still.has(f.pathname)) };
}

/* A submission this viewer may open: their own, or any in a course they
   teach (admins: any). Staff checked in SQL. */
export async function submissionForViewer(submissionId: string, viewer: Viewer): Promise<Submission | null> {
  const [row] = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(eq(submissions.id, submissionId), or(eq(submissions.userId, viewer.id), staffPredicate(viewer))))
    .limit(1);
  return row?.submission ?? null;
}

/* Counts for the lesson editor's assignment card. */
export async function submissionCounts(assignmentId: string): Promise<{ handedIn: number; toGrade: number; returned: number }> {
  const rows = await db
    .select({ status: submissions.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(submissions)
    .where(eq(submissions.assignmentId, assignmentId))
    .groupBy(submissions.status);
  const n = (s: Submission["status"]) => rows.find((r) => r.status === s)?.n ?? 0;
  return { handedIn: n("submitted") + n("graded") + n("returned"), toGrade: n("submitted") + n("graded"), returned: n("returned") };
}

/* Student work that deleting these lessons would destroy: a submission,
   or a submitted graded-quiz attempt. Grades are kept for audit, so the
   builder refuses to delete such a lesson (or its module). */
export async function lessonsHaveStudentWork(lessonIds: string[]): Promise<boolean> {
  if (lessonIds.length === 0) return false;
  const [handedIn, quizzed] = await db.batch([
    db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(inArray(assignments.lessonId, lessonIds))
      .limit(1),
    db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(inArray(quizAttempts.lessonId, lessonIds), eq(quizAttempts.mode, "graded"), isNotNull(quizAttempts.submittedAt)))
      .limit(1),
  ]);
  return handedIn.length > 0 || quizzed.length > 0;
}

export async function moduleHasStudentWork(moduleId: string): Promise<boolean> {
  const rows = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.moduleId, moduleId));
  return lessonsHaveStudentWork(rows.map((r) => r.id));
}
