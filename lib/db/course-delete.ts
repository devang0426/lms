import "server-only";

import { sql } from "drizzle-orm";
import type { CourseDeleteFacts } from "@/lib/courses/delete";
import { db } from "./client";

/* Deleting a course (feature 35). The rule is in lib/courses/delete.ts;
   the SQL below is its one source for the database, used both to explain
   (courseDeleteFacts) and inside the delete itself (deleteUnusedCourse),
   so a student enrolled or a submission made in between still stops it.
   Each body refers to the course row as `c`. Callers check course staff. */

const ACTIVE_STUDENTS = `from enrollments e join sections s on s.id = e.section_id
  where s.course_id = c.id and e.status = 'active'`;
const SUBMISSIONS = `from submissions sub join assignments a on a.id = sub.assignment_id
  join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
  where m.course_id = c.id`;
const GRADED_ATTEMPTS = `from quiz_attempts qa join lessons l on l.id = qa.lesson_id join modules m on m.id = l.module_id
  where m.course_id = c.id and qa.mode = 'graded' and qa.submitted_at is not null`;
const PENDING_INVITATIONS = `from invitations i where i.course_id = c.id and i.accepted_at is null`;

const count = (body: string) => sql.raw(`(select count(*) ${body})::int`);
const none = (body: string) => sql.raw(`not exists (select 1 ${body})`);

export async function courseDeleteFacts(courseId: string): Promise<(CourseDeleteFacts & { code: string; title: string }) | null> {
  const result = await db.execute<{
    code: string;
    title: string;
    active_students: number;
    submissions: number;
    graded_attempts: number;
    pending_invitations: number;
    modules: number;
    lessons: number;
  }>(sql`
    select c.code, c.title,
      ${count(ACTIVE_STUDENTS)} as active_students,
      ${count(SUBMISSIONS)} as submissions,
      ${count(GRADED_ATTEMPTS)} as graded_attempts,
      ${count(PENDING_INVITATIONS)} as pending_invitations,
      (select count(*) from modules m where m.course_id = c.id)::int as modules,
      (select count(*) from lessons l join modules m on m.id = l.module_id where m.course_id = c.id)::int as lessons
    from courses c
    where c.id = ${courseId}::uuid`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    code: row.code,
    title: row.title,
    activeStudents: Number(row.active_students),
    handedIn: Number(row.submissions) + Number(row.graded_attempts),
    pendingInvitations: Number(row.pending_invitations),
    modules: Number(row.modules),
    lessons: Number(row.lessons),
  };
}

/* One statement: delete the course only if nobody depends on it (the
   rule, checked again here), delete the notifications that link into it,
   and write its course.delete audit row, only when it went. Everything
   else under the course cascades (sections, enrollments, staff, modules,
   lessons and their content, chunks, threads, events, announcements,
   discussions, invitations). Returns false when the course is gone
   already or the rule now refuses. */
export async function deleteUnusedCourse(input: { courseId: string; actorId: string; data: Record<string, unknown> }): Promise<boolean> {
  const { courseId, actorId, data } = input;
  const result = await db.execute<{ entity_id: string }>(sql`
    with gone as (
      delete from courses c
      where c.id = ${courseId}::uuid
        and ${none(ACTIVE_STUDENTS)}
        and ${none(SUBMISSIONS)}
        and ${none(GRADED_ATTEMPTS)}
        and ${none(PENDING_INVITATIONS)}
      returning c.id, c.code, c.title
    ),
    notices as (
      delete from notifications n
      where exists (select 1 from gone)
        and (n.url like ${`/courses/${courseId}%`} or n.url like ${`/instructor/courses/${courseId}%`})
    )
    insert into audit_log (actor_id, action, entity_type, entity_id, data)
    select ${actorId}::uuid, 'course.delete', 'course', gone.id::text,
      jsonb_build_object('code', gone.code, 'title', gone.title) || ${JSON.stringify(data)}::jsonb
    from gone
    returning entity_id`);
  return result.rows.length > 0;
}
