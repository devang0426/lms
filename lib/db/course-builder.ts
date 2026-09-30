import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { LessonFacts } from "@/lib/courses/lessons";
import type { CourseSetupFacts } from "@/lib/courses/setup";
import { db } from "./client";
import { courses, lessons, modules } from "./schema";

/* What the course builder needs beyond the curriculum itself (feature 27):
   per lesson, whether it has a ready video, whether it's still empty
   (Change type), and its drafts (the Publish confirm step); per course,
   the facts behind the "Get your course live" checklist. Callers check
   course staff first. The correlated subqueries name the outer rows
   literally (`lessons.id`, `courses.id`), see lib/db/courses.ts. */

/* Anything that ties a lesson to its type: a video in any state,
   documents, an assignment, or generated content (drafts or published).
   Also the guard in changeLessonType's UPDATE, so an upload that lands
   meanwhile wins. */
export const lessonInUse: SQL = sql`(
  exists (select 1 from videos x where x.lesson_id = lessons.id)
  or exists (select 1 from documents x where x.lesson_id = lessons.id)
  or exists (select 1 from assignments x where x.lesson_id = lessons.id)
  or exists (select 1 from chapters x where x.lesson_id = lessons.id)
  or exists (select 1 from notes x where x.lesson_id = lessons.id)
  or exists (select 1 from flashcards x where x.lesson_id = lessons.id)
  or exists (select 1 from quiz_questions x where x.lesson_id = lessons.id)
  or exists (select 1 from graded_quizzes x where x.lesson_id = lessons.id)
  or exists (select 1 from podcasts x where x.lesson_id = lessons.id)
)`;

const drafts = (table: string) =>
  sql<number>`(select count(*) from ${sql.raw(table)} x where x.lesson_id = lessons.id and x.status = 'draft')`.mapWith(Number);

/* As a statement for the builder page's batch (feature 29), which runs it
   beside the staff check: `staffOnly` (isStaffOf) keeps it empty for
   anyone else. */
export function lessonBuilderFactsQuery(courseId: string, staffOnly: SQL = sql`true`) {
  return db
    .select({
      id: lessons.id,
      readyVideo: sql<boolean>`exists (select 1 from videos v where v.lesson_id = lessons.id and v.status = 'ready')`,
      inUse: sql<boolean>`${lessonInUse}`,
      notes: drafts("notes"),
      cards: drafts("flashcards"),
      questions: drafts("quiz_questions"),
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, courseId), staffOnly));
}

export function toLessonFacts(rows: Awaited<ReturnType<typeof lessonBuilderFactsQuery>>): Map<string, LessonFacts> {
  return new Map(
    rows.map((r) => [r.id, { readyVideo: r.readyVideo, empty: !r.inUse, drafts: { notes: r.notes, cards: r.cards, questions: r.questions } }]),
  );
}

export async function lessonBuilderFacts(courseId: string): Promise<Map<string, LessonFacts>> {
  return toLessonFacts(await lessonBuilderFactsQuery(courseId));
}

/* ---- The checklist ---------------------------------------------------------- */

const inCourse = sql`from lessons l join modules m on m.id = l.module_id where m.course_id = courses.id`;
const lecture = sql`l.kind = 'video' and exists (select 1 from videos v where v.lesson_id = l.id and v.status = 'ready')`;
const hasContent = sql`(exists (select 1 from notes x where x.lesson_id = l.id)
  or exists (select 1 from flashcards x where x.lesson_id = l.id)
  or exists (select 1 from quiz_questions x where x.lesson_id = l.id))`;
const hasDrafts = sql`(exists (select 1 from notes x where x.lesson_id = l.id and x.status = 'draft')
  or exists (select 1 from flashcards x where x.lesson_id = l.id and x.status = 'draft')
  or exists (select 1 from quiz_questions x where x.lesson_id = l.id and x.status = 'draft'))`;

export type SetupCourse = CourseSetupFacts & { code: string; title: string };

/* One course (the course page), or every course this person is on the
   staff of, newest first (the overview). Admins get only their own
   courses here, not everyone's. */
export async function courseSetupFacts(scope: { courseId: string } | { staffUserId: string }): Promise<SetupCourse[]> {
  return courseSetupFactsQuery(scope);
}

/* As a statement for a page's batch (feature 29); `staffOnly` as in
   lessonBuilderFactsQuery. */
export function courseSetupFactsQuery(scope: { courseId: string } | { staffUserId: string }, staffOnly: SQL = sql`true`) {
  return db
    .select({
      courseId: courses.id,
      code: courses.code,
      title: courses.title,
      hasDetails: sql<boolean>`courses.summary <> ''`,
      modules: sql<number>`(select count(*) from modules m where m.course_id = courses.id)`.mapWith(Number),
      lectures: sql<number>`(select count(*) ${inCourse} and ${lecture})`.mapWith(Number),
      reviewLessonId: sql<string | null>`(select l.id ${inCourse} and ${lecture} order by ${hasDrafts} desc, m.position, l.position limit 1)`,
      reviewed: sql<boolean>`exists (select 1 ${inCourse} and ${lecture} and ${hasContent} and not ${hasDrafts})`,
      live: sql<boolean>`courses.status = 'published'
        and exists (select 1 ${inCourse} and ${lecture} and l.status = 'published' and m.status = 'published')`,
      students: sql<number>`(select count(*) from enrollments e join sections s on s.id = e.section_id
        where s.course_id = courses.id and e.status = 'active')`.mapWith(Number),
    })
    .from(courses)
    .where(
      and(
        "courseId" in scope
          ? eq(courses.id, scope.courseId)
          : sql`exists (select 1 from course_staff cs where cs.course_id = courses.id and cs.user_id = ${scope.staffUserId})`,
        staffOnly,
      ),
    )
    .orderBy(desc(courses.createdAt));
}
