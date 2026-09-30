import "server-only";

import { and, asc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { eventLink, type CalendarEvent } from "@/lib/calendar";
import { db } from "./client";
import { enrolledPredicate, staffPredicate, type Viewer } from "./courses";
import { courses, events, lessons, modules, type EventKind } from "./schema";

/* The course calendar (feature 21). Reads join events to their course,
   and to their lesson when they have one, with the access rule inside the
   SQL: staff see every event of their courses; a student sees events of
   published courses they're actively enrolled in, and a lesson's due date
   or quiz only while that lesson and its module are published. */

function visibleTo(viewer: Viewer): SQL {
  return or(
    staffPredicate(viewer),
    and(
      eq(courses.status, "published"),
      enrolledPredicate(viewer),
      or(isNull(events.lessonId), and(eq(lessons.status, "published"), eq(modules.status, "published"))),
    ),
  )!;
}

function columns(viewer: Viewer) {
  return {
    id: events.id,
    courseId: events.courseId,
    courseCode: courses.code,
    kind: events.kind,
    // A due date is named after its lesson, which the instructor may rename.
    title: sql<string>`case when ${events.kind} = 'due' and ${lessons.title} is not null then ${lessons.title} else ${events.title} end`,
    at: events.at,
    url: events.url,
    done: sql<boolean>`case
      when ${events.kind} = 'due' then exists (select 1 from submissions s where s.assignment_id = ${events.sourceId} and s.user_id = ${viewer.id})
      when ${events.kind} = 'quiz' then exists (select 1 from quiz_attempts qa where qa.graded_quiz_id = ${events.sourceId}
        and qa.user_id = ${viewer.id} and qa.submitted_at is not null)
      else false end`,
  };
}

type Row = { id: string; courseId: string; courseCode: string; kind: EventKind; title: string; at: Date; url: string | null; done: boolean };

function toView(r: Row): CalendarEvent {
  const link = eventLink(r.url);
  return {
    id: r.id,
    courseId: r.courseId,
    courseCode: r.courseCode,
    kind: r.kind,
    title: r.title,
    at: r.at.getTime(),
    href: link?.href ?? null,
    external: link?.external ?? false,
    done: Boolean(r.done),
  };
}

function baseQuery(viewer: Viewer) {
  return db
    .select(columns(viewer))
    .from(events)
    .innerJoin(courses, eq(courses.id, events.courseId))
    .leftJoin(lessons, eq(lessons.id, events.lessonId))
    .leftJoin(modules, eq(modules.id, lessons.moduleId));
}

/* Everything on the viewer's calendar in [from, to). */
export async function eventsBetween(viewer: Viewer, from: Date, to: Date): Promise<CalendarEvent[]> {
  const rows = await baseQuery(viewer)
    .where(and(visibleTo(viewer), gte(events.at, from), lt(events.at, to)))
    .orderBy(asc(events.at), asc(events.id));
  return rows.map(toView);
}

/* "Coming up": the next few events from `from`. */
export function upcomingEventsQuery(viewer: Viewer, from: Date, limit: number) {
  return baseQuery(viewer)
    .where(and(visibleTo(viewer), gte(events.at, from)))
    .orderBy(asc(events.at), asc(events.id))
    .limit(limit);
}

export function toEvents(rows: Row[]): CalendarEvent[] {
  return rows.map(toView);
}

/* A course's events for its staff (the builder's Calendar tab), from
   `from` on. Call after requireCourseStaff. */
export function courseEventsForStaffQuery(viewer: Viewer, courseId: string, from: Date) {
  return baseQuery(viewer)
    .where(and(eq(events.courseId, courseId), staffPredicate(viewer), gte(events.at, from)))
    .orderBy(asc(events.at), asc(events.id));
}

export async function courseEventsForStaff(viewer: Viewer, courseId: string, from: Date): Promise<CalendarEvent[]> {
  return toEvents(await courseEventsForStaffQuery(viewer, courseId, from));
}

/* ---- Writes ---------------------------------------------------------------- */

/* The assignment's due date on the calendar, for the batch that saves the
   assignment (after its upsert). One event per assignment: a new due date
   moves it. */
export function assignmentEventStatement(lessonId: string) {
  return db.execute(sql`
    insert into events (course_id, lesson_id, kind, title, at, url, source_id)
    select m.course_id, l.id, 'due', l.title, a.due_at, '/courses/' || m.course_id || '/lessons/' || l.id, a.id
    from assignments a
    join lessons l on l.id = a.lesson_id
    join modules m on m.id = l.module_id
    where a.lesson_id = ${lessonId}
    on conflict (kind, source_id) do update
      set at = excluded.at, title = excluded.title, url = excluded.url, updated_at = now()`);
}

/* A new graded quiz's due date, for the batch that creates the quiz
   (after its insert). */
export function gradedQuizEventStatement(quizId: string) {
  return db.execute(sql`
    insert into events (course_id, lesson_id, kind, title, at, url, source_id, created_by)
    select m.course_id, l.id, 'quiz', q.title, q.due_at, '/courses/' || m.course_id || '/lessons/' || l.id, q.id, q.created_by
    from graded_quizzes q
    join lessons l on l.id = q.lesson_id
    join modules m on m.id = l.module_id
    where q.id = ${quizId}
    on conflict (kind, source_id) do update set at = excluded.at, title = excluded.title, updated_at = now()`);
}

/* The kinds staff add by hand. Due dates and quizzes come from their source. */
export const MANUAL_EVENT_KINDS = ["live", "custom"] as const satisfies readonly EventKind[];

export function addEventStatement(input: {
  id: string;
  courseId: string;
  kind: (typeof MANUAL_EVENT_KINDS)[number];
  title: string;
  at: Date;
  url: string | null;
  createdBy: string;
}) {
  return db.insert(events).values(input);
}

/* A hand-added event of this course, or null (due dates and quizzes
   aren't deleted here: they follow their assignment or quiz). */
export async function manualEvent(eventId: string, courseId: string): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.courseId, courseId), inArray(events.kind, [...MANUAL_EVENT_KINDS])))
    .limit(1);
  return row ?? null;
}

export function deleteEventStatement(eventId: string, courseId: string) {
  return db
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.courseId, courseId), inArray(events.kind, [...MANUAL_EVENT_KINDS])));
}
