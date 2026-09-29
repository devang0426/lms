import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { CourseFacts } from "@/lib/dashboard/stats";
import { db } from "./client";
import { staffPredicate, type Viewer } from "./courses";
import { courses, discussions, type Course } from "./schema";

/* The instructor dashboard (feature 22): the courses this viewer teaches
   (admins: all), with learners, published lessons and completions per
   course, and who was active in the last 7 days. The staff check is in
   the SQL. "Learners" are students actively enrolled; "active" means they
   did something in the course in the window: watched, reviewed a card,
   took a quiz, asked the assistant, handed in work, or posted in a
   discussion. */

export interface DashboardCourse extends CourseFacts {
  course: Pick<Course, "id" | "code" | "title" | "status">;
  active: number;
}

export interface DashboardData {
  courses: DashboardCourse[];
  /* Distinct across courses (a student in two courses counts once). */
  learners: number;
  active: number;
  unanswered: number;
}

const enrolledIn = (courseCol: string) =>
  `exists (select 1 from enrollments e join sections s on s.id = e.section_id
    where s.course_id = ${courseCol} and e.user_id = x.user_id and e.status = 'active')`;

export async function dashboardData(viewer: Viewer, since: Date): Promise<DashboardData> {
  const courseRows = await db
    .select({
      course: { id: courses.id, code: courses.code, title: courses.title, status: courses.status },
      learners: sql<number>`(select count(distinct e.user_id) from enrollments e join sections s on s.id = e.section_id
        where s.course_id = courses.id and e.status = 'active')`.mapWith(Number),
      lessons: sql<number>`(select count(*) from lessons l join modules m on m.id = l.module_id
        where m.course_id = courses.id and m.status = 'published' and l.status = 'published')`.mapWith(Number),
      completions: sql<number>`(select count(*) from watch_progress wp
        join lessons l on l.id = wp.lesson_id join modules m on m.id = l.module_id
        where m.course_id = courses.id and m.status = 'published' and l.status = 'published' and wp.completed_at is not null
          and exists (select 1 from enrollments e join sections s on s.id = e.section_id
            where s.course_id = courses.id and e.user_id = wp.user_id and e.status = 'active'))`.mapWith(Number),
    })
    .from(courses)
    .where(staffPredicate(viewer))
    .orderBy(asc(courses.code));
  const ids = courseRows.map((c) => c.course.id);
  if (ids.length === 0) return { courses: [], learners: 0, active: 0, unanswered: 0 };

  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [pairs, allLearners, [open]] = await db.batch([
    // (course, student) pairs with activity since `since`, enrolled students only.
    db.execute<{ course_id: string; user_id: string }>(sql`
      select distinct x.course_id, x.user_id from (
        select m.course_id, wp.user_id from watch_progress wp
          join lessons l on l.id = wp.lesson_id join modules m on m.id = l.module_id
          where wp.updated_at >= ${since.toISOString()}::timestamptz
        union all
        select m.course_id, cr.user_id from card_reviews cr
          join flashcards f on f.id = cr.card_id join lessons l on l.id = f.lesson_id join modules m on m.id = l.module_id
          where cr.last_review >= ${since.toISOString()}::timestamptz
        union all
        select m.course_id, qa.user_id from quiz_attempts qa
          join lessons l on l.id = qa.lesson_id join modules m on m.id = l.module_id
          where qa.started_at >= ${since.toISOString()}::timestamptz
        union all
        select t.course_id, t.user_id from chat_turns ct join chat_threads t on t.id = ct.thread_id
          where ct.role = 'user' and t.course_id is not null and ct.created_at >= ${since.toISOString()}::timestamptz
        union all
        select m.course_id, sub.user_id from submissions sub
          join assignments a on a.id = sub.assignment_id join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
          where sub.submitted_at >= ${since.toISOString()}::timestamptz
        union all
        select d.course_id, d.author_id from discussions d where d.created_at >= ${since.toISOString()}::timestamptz
        union all
        select d.course_id, r.author_id from discussion_replies r join discussions d on d.id = r.discussion_id
          where r.created_at >= ${since.toISOString()}::timestamptz
      ) as x(course_id, user_id)
      where x.course_id in (${idList}) and ${sql.raw(enrolledIn("x.course_id"))}`),
    db.execute<{ n: number }>(sql`
      select count(distinct e.user_id)::int as n from enrollments e join sections s on s.id = e.section_id
      where e.status = 'active' and s.course_id in (${idList})`),
    db.select({ n: count() }).from(discussions).where(and(eq(discussions.status, "open"), inArray(discussions.courseId, ids))),
  ]);

  const activeByCourse = new Map<string, number>();
  for (const p of pairs.rows) activeByCourse.set(p.course_id, (activeByCourse.get(p.course_id) ?? 0) + 1);
  return {
    courses: courseRows.map((c) => ({ ...c, courseId: c.course.id, active: activeByCourse.get(c.course.id) ?? 0 })),
    learners: Number(allLearners.rows[0]?.n ?? 0),
    active: new Set(pairs.rows.map((p) => p.user_id)).size,
    unanswered: open?.n ?? 0,
  };
}
