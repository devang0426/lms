import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assignmentEventStatement } from "@/lib/db/events";
import { assignments, courses, lessons, modules, submissions } from "@/lib/db/schema";

/* The demo assignment (feature 20, demo step 9): a published problem set
   in the demo course, and a submission from the Demo Student waiting in
   the grading queue. `npm run db:seed` creates both; `npm run demo:reset`
   clears the student's work and puts the ungraded submission back, so
   the instructor always has something to grade. */

export const DEMO_COURSE_CODE = "MATH 201";

const DEMO_ASSIGNMENT = {
  lessonTitle: "Problem set 1: span and independence",
  moduleTitle: "Vectors and spaces",
  points: 10,
  category: "homework" as const,
  allowLate: true,
  instructions: `Work through the three problems below and show your reasoning: a right answer with no working gets half marks.

1. Is $\\mathbf{w} = (3, 1)$ a linear combination of $\\mathbf{u} = (1, 1)$ and $\\mathbf{v} = (1, -1)$? If it is, find the weights.
2. Describe the span of $(1, 2)$ and $(2, 4)$ in $\\mathbb{R}^2$. Why isn't it the whole plane?
3. Are $(1, 0, 1)$, $(0, 1, 1)$ and $(1, 1, 2)$ linearly independent? Justify your answer.

Type your answers below, or attach a photo or PDF of your handwritten working.

**Marking:** 3 points for problem 1, 4 for problem 2 and 3 for problem 3.`,
};

const DEMO_SUBMISSION_TEXT = `1. Yes. Solving a(1, 1) + b(1, -1) = (3, 1) gives a + b = 3 and a - b = 1, so a = 2 and b = 1. So w = 2u + v.

2. (2, 4) = 2 · (1, 2), so both vectors lie on the same line through the origin. Their span is just that line, y = 2x. To reach every point in the plane you need two vectors pointing in different directions.

3. No. (1, 0, 1) + (0, 1, 1) = (1, 1, 2), so the third vector is a combination of the first two and the set is linearly dependent.`;

/* A week from now at 23:59 UTC. */
function aWeekFromNow(): Date {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setUTCHours(23, 59, 0, 0);
  return d;
}

/* The assignment lesson and its row. Created once; a re-run keeps the
   instructor's edits, re-publishes the lesson, and moves a due date that
   is less than two days away to a week out, so the demo can hand in. */
export async function ensureDemoAssignment(courseId: string, adminId: string): Promise<{ assignmentId: string; created: boolean }> {
  const [existing] = await db
    .select({ lessonId: lessons.id, assignment: assignments })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(assignments, eq(assignments.lessonId, lessons.id))
    .where(and(eq(modules.courseId, courseId), eq(lessons.title, DEMO_ASSIGNMENT.lessonTitle)))
    .limit(1);

  let lessonId = existing?.lessonId;
  if (!lessonId) {
    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(sql`${modules.title} = ${DEMO_ASSIGNMENT.moduleTitle} desc`, asc(modules.position))
      .limit(1);
    if (!mod) throw new Error("The demo course has no modules.");
    const [row] = await db
      .insert(lessons)
      .values({
        moduleId: mod.id,
        title: DEMO_ASSIGNMENT.lessonTitle,
        kind: "assignment",
        status: "published",
        publishedAt: new Date(),
        position: sql`(select coalesce(max(position), -1) + 1 from lessons where module_id = ${mod.id})`,
      })
      .returning({ id: lessons.id });
    lessonId = row.id;
  } else {
    await db.update(lessons).set({ kind: "assignment", status: "published" }).where(eq(lessons.id, lessonId));
  }

  const assignment = existing?.assignment;
  if (!assignment) {
    const [row] = await db
      .insert(assignments)
      .values({
        lessonId,
        instructions: DEMO_ASSIGNMENT.instructions,
        dueAt: aWeekFromNow(),
        points: DEMO_ASSIGNMENT.points,
        allowLate: DEMO_ASSIGNMENT.allowLate,
        category: DEMO_ASSIGNMENT.category,
        createdBy: adminId,
      })
      .returning({ id: assignments.id });
    await assignmentEventStatement(lessonId); // its due date on the calendar (feature 21)
    return { assignmentId: row.id, created: true };
  }
  if (assignment.dueAt.getTime() < Date.now() + 2 * 86_400_000) {
    await db.update(assignments).set({ dueAt: aWeekFromNow() }).where(eq(assignments.id, assignment.id));
  }
  await assignmentEventStatement(lessonId);
  return { assignmentId: assignment.id, created: false };
}

/* The demo assignment's id, or null if the seed hasn't created it. */
async function demoAssignmentId(): Promise<string | null> {
  const [row] = await db
    .select({ id: assignments.id })
    .from(assignments)
    .innerJoin(lessons, eq(lessons.id, assignments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(eq(courses.code, DEMO_COURSE_CODE), eq(lessons.title, DEMO_ASSIGNMENT.lessonTitle)))
    .limit(1);
  return row?.id ?? null;
}

/* The Demo Student's handed-in, ungraded work. Left alone if they already
   have a submission (graded or not): demo:reset deletes it first. */
export async function ensureDemoSubmission(studentId: string, assignmentId?: string): Promise<"created" | "kept" | "no assignment"> {
  const id = assignmentId ?? (await demoAssignmentId());
  if (!id) return "no assignment";
  const [assignment] = await db.select({ dueAt: assignments.dueAt }).from(assignments).where(eq(assignments.id, id));
  const submittedAt = new Date(Date.now() - 2 * 3_600_000);
  const inserted = await db
    .insert(submissions)
    .values({
      assignmentId: id,
      userId: studentId,
      text: DEMO_SUBMISSION_TEXT,
      files: [],
      submittedAt,
      late: assignment ? submittedAt > assignment.dueAt : false,
      status: "submitted",
    })
    .onConflictDoNothing({ target: [submissions.assignmentId, submissions.userId] })
    .returning({ id: submissions.id });
  return inserted.length > 0 ? "created" : "kept";
}
