import "server-only";

import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { GradebookItem, GradebookStudent, WorkFact } from "@/lib/coursework/gradebook";
import { db } from "./client";
import { enrolledPredicate, staffPredicate, type Viewer } from "./courses";
import {
  assignments,
  courses,
  enrollments,
  gradeCategories,
  gradedQuizzes,
  grades,
  lessons,
  modules,
  quizAttempts,
  sections,
  submissions,
  users,
  type AssignmentCategory,
  type Grade,
  type SubmissionStatus,
} from "./schema";

/* Grading and the gradebook (feature 20). The queue and the grade view
   carry the course-staff check in their SQL; the gradebook's reads are
   called after requireCourseStaff; a student's grades are read for that
   student only, through their active enrollments. */

const inQueue = inArray(submissions.status, ["submitted", "graded"]);

export interface QueueItem {
  submissionId: string;
  submittedAt: Date;
  late: boolean;
  status: SubmissionStatus;
  student: { id: string; name: string };
  assignment: { id: string; lessonId: string; title: string; points: number; dueAt: Date };
  course: { id: string; code: string; title: string };
}

const queueColumns = {
  submissionId: submissions.id,
  submittedAt: submissions.submittedAt,
  late: submissions.late,
  status: submissions.status,
  student: { id: users.id, name: users.name },
  assignment: { id: assignments.id, lessonId: lessons.id, title: lessons.title, points: assignments.points, dueAt: assignments.dueAt },
  course: { id: courses.id, code: courses.code, title: courses.title },
};

/* Everything waiting in the viewer's courses, oldest first. A draft grade
   (`graded`) stays in the queue until it's returned. */
export async function gradingQueue(viewer: Viewer): Promise<QueueItem[]> {
  return db
    .select(queueColumns)
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.userId))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(inQueue, staffPredicate(viewer)))
    .orderBy(asc(submissions.submittedAt), asc(submissions.id));
}

/* The oldest queued submission other than this one: "Save and next". */
export async function nextInQueue(viewer: Viewer, afterSubmissionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(inQueue, ne(submissions.id, afterSubmissionId), staffPredicate(viewer)))
    .orderBy(asc(submissions.submittedAt), asc(submissions.id))
    .limit(1);
  return row?.id ?? null;
}

export interface GradingView extends QueueItem {
  text: string;
  files: { name: string; contentType: string; size: number }[];
  instructions: string;
  studentEmail: string;
  grade: Pick<Grade, "score" | "maxScore" | "feedback" | "gradedAt"> | null;
  gradedByName: string | null;
}

/* One submission for the grade view, if the viewer teaches its course.
   File URLs stay on the server: the page links to the access-checked
   route instead. */
export async function submissionForGrading(submissionId: string, viewer: Viewer): Promise<GradingView | null> {
  const [row] = await db
    .select({
      ...queueColumns,
      text: submissions.text,
      files: submissions.files,
      instructions: assignments.instructions,
      studentEmail: users.email,
      grade: { score: grades.score, maxScore: grades.maxScore, feedback: grades.feedback, gradedAt: grades.gradedAt },
      gradedByName: sql<string | null>`(select g.name from users g where g.id = ${grades.gradedBy})`,
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.userId))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .leftJoin(grades, eq(grades.submissionId, submissions.id))
    .where(and(eq(submissions.id, submissionId), staffPredicate(viewer)))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    files: row.files.map((f) => ({ name: f.name, contentType: f.contentType, size: f.size })),
    grade: row.grade?.score != null ? (row.grade as GradingView["grade"]) : null,
  };
}

/* The grade upsert and the submission's new status, for the caller's
   batch (with its audit row). `graded` keeps it a draft; `returned` gives
   it to the student. The status update only matches a submission of this
   student, so a stale form can't move another row. */
export function saveGradeStatements(input: {
  submissionId: string;
  studentId: string;
  score: number;
  maxScore: number;
  feedback: string;
  gradedBy: string;
  status: "graded" | "returned";
}) {
  const now = new Date();
  const fields = { score: input.score, maxScore: input.maxScore, feedback: input.feedback, gradedBy: input.gradedBy, gradedAt: now };
  return [
    db
      .insert(grades)
      .values({ submissionId: input.submissionId, userId: input.studentId, ...fields })
      .onConflictDoUpdate({ target: grades.submissionId, set: fields }),
    db
      .update(submissions)
      .set({ status: input.status })
      .where(and(eq(submissions.id, input.submissionId), eq(submissions.userId, input.studentId))),
  ] as const;
}

/* ---- Gradebook ------------------------------------------------------------------ */

export interface GradebookData {
  students: GradebookStudent[];
  items: GradebookItem[];
  facts: WorkFact[];
  weightRows: { category: AssignmentCategory; weight: number }[];
}

/* Everything the gradebook needs for one course, in one round trip.
   Items follow the curriculum order (module, lesson), then due date. */
export async function gradebookData(courseId: string): Promise<GradebookData> {
  const [students, assignmentRows, quizRows, submissionRows, quizBest, weightRows] = await db.batch([
    db
      .selectDistinct({ id: users.id, name: users.name, email: users.email })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(and(eq(sections.courseId, courseId), eq(enrollments.status, "active")))
      .orderBy(asc(users.name), asc(users.id)),
    db
      .select({
        id: assignments.id,
        title: lessons.title,
        category: assignments.category,
        points: assignments.points,
        dueAt: assignments.dueAt,
        modulePos: modules.position,
        lessonPos: lessons.position,
      })
      .from(assignments)
      .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(eq(modules.courseId, courseId)),
    db
      .select({
        id: gradedQuizzes.id,
        title: gradedQuizzes.title,
        points: gradedQuizzes.points,
        dueAt: gradedQuizzes.dueAt,
        modulePos: modules.position,
        lessonPos: lessons.position,
      })
      .from(gradedQuizzes)
      .innerJoin(lessons, eq(lessons.id, gradedQuizzes.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(eq(modules.courseId, courseId)),
    db
      .select({
        userId: submissions.userId,
        itemId: submissions.assignmentId,
        submissionId: submissions.id,
        status: submissions.status,
        late: submissions.late,
        score: grades.score,
        maxScore: grades.maxScore,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .leftJoin(grades, eq(grades.submissionId, submissions.id))
      .where(eq(modules.courseId, courseId)),
    db
      .select({
        userId: quizAttempts.userId,
        itemId: gradedQuizzes.id,
        points: gradedQuizzes.points,
        best: sql<number>`max(${quizAttempts.score})`.mapWith(Number),
      })
      .from(quizAttempts)
      .innerJoin(gradedQuizzes, eq(gradedQuizzes.id, quizAttempts.gradedQuizId))
      .innerJoin(lessons, eq(lessons.id, gradedQuizzes.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(eq(modules.courseId, courseId), isNotNull(quizAttempts.submittedAt)))
      .groupBy(quizAttempts.userId, gradedQuizzes.id, gradedQuizzes.points),
    db.select({ category: gradeCategories.category, weight: gradeCategories.weight }).from(gradeCategories).where(eq(gradeCategories.courseId, courseId)),
  ]);

  const ordered = [
    ...assignmentRows.map((a) => ({ ...a, kind: "assignment" as const })),
    ...quizRows.map((q) => ({ ...q, kind: "quiz" as const, category: "quiz" as const })),
  ].sort((a, b) => a.modulePos - b.modulePos || a.lessonPos - b.lessonPos || a.dueAt.getTime() - b.dueAt.getTime());

  return {
    students,
    items: ordered.map((it) => ({ id: it.id, kind: it.kind, title: it.title, category: it.category, points: it.points, dueAt: it.dueAt.getTime() })),
    facts: [
      ...submissionRows.map((s) => ({ ...s, score: s.score ?? null, maxScore: s.maxScore ?? null })),
      ...quizBest.map((q) => ({
        userId: q.userId,
        itemId: q.itemId,
        status: "quiz" as const,
        late: false,
        score: Math.round(q.best * q.points * 100) / 100,
        maxScore: q.points,
        submissionId: null,
      })),
    ],
    weightRows,
  };
}

/* ---- A student's own grades --------------------------------------------------- */

export interface StudentGradeRow {
  courseId: string;
  itemId: string;
  kind: "assignment" | "quiz";
  lessonId: string;
  title: string;
  category: AssignmentCategory;
  points: number;
  dueAt: Date;
  status: SubmissionStatus | null;
  late: boolean;
  /* Only for a returned grade or a submitted quiz attempt. */
  score: number | null;
  maxScore: number | null;
  modulePos: number;
  lessonPos: number;
}

/* Visible = the student is actively enrolled and the course, module and
   lesson are published (the same rule as the lesson player). */
function visibleTo(viewer: Viewer) {
  return and(
    eq(courses.status, "published"),
    eq(modules.status, "published"),
    eq(lessons.status, "published"),
    enrolledPredicate(viewer),
  );
}

/* Every assignment and graded quiz the student can see, across their
   courses, with only what's theirs to see: a draft grade reads as
   "handed in", never as a score. */
export async function studentGradeRows(viewer: Viewer): Promise<StudentGradeRow[]> {
  const [assignmentRows, quizRows] = await db.batch([
    db
      .select({
        courseId: courses.id,
        itemId: assignments.id,
        lessonId: lessons.id,
        title: lessons.title,
        category: assignments.category,
        points: assignments.points,
        dueAt: assignments.dueAt,
        status: submissions.status,
        late: submissions.late,
        score: grades.score,
        maxScore: grades.maxScore,
        modulePos: modules.position,
        lessonPos: lessons.position,
      })
      .from(assignments)
      .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.userId, viewer.id)))
      .leftJoin(grades, and(eq(grades.submissionId, submissions.id), eq(submissions.status, "returned")))
      .where(visibleTo(viewer)),
    db
      .select({
        courseId: courses.id,
        itemId: gradedQuizzes.id,
        lessonId: lessons.id,
        title: gradedQuizzes.title,
        points: gradedQuizzes.points,
        dueAt: gradedQuizzes.dueAt,
        best: sql<number | null>`(select max(a.score) from quiz_attempts a
          where a.graded_quiz_id = graded_quizzes.id and a.user_id = ${viewer.id} and a.submitted_at is not null)`,
        modulePos: modules.position,
        lessonPos: lessons.position,
      })
      .from(gradedQuizzes)
      .innerJoin(lessons, eq(lessons.id, gradedQuizzes.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(visibleTo(viewer)),
  ]);

  const rows: StudentGradeRow[] = [
    ...assignmentRows.map((a) => ({
      ...a,
      kind: "assignment" as const,
      late: a.late ?? false,
      score: a.status === "returned" ? (a.score ?? null) : null,
      maxScore: a.status === "returned" ? (a.maxScore ?? null) : null,
    })),
    ...quizRows.map(({ best, ...q }) => {
      const score = best === null ? null : Math.round(Number(best) * q.points * 100) / 100;
      return {
        ...q,
        kind: "quiz" as const,
        category: "quiz" as const,
        status: best === null ? null : ("returned" as const),
        late: false,
        score,
        maxScore: score === null ? null : q.points,
      };
    }),
  ];
  return rows.sort((a, b) => a.modulePos - b.modulePos || a.lessonPos - b.lessonPos || a.dueAt.getTime() - b.dueAt.getTime());
}

/* Weight rows for the student's courses. */
export async function weightRowsFor(courseIds: string[]) {
  if (courseIds.length === 0) return [];
  return db
    .select({ courseId: gradeCategories.courseId, category: gradeCategories.category, weight: gradeCategories.weight })
    .from(gradeCategories)
    .where(inArray(gradeCategories.courseId, courseIds));
}
