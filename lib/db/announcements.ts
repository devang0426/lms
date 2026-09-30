import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { clip } from "@/lib/notifications/view";
import { db } from "./client";
import { staffPredicate, type Viewer } from "./courses";
import { announcements, courses, users } from "./schema";

/* Course announcements (feature 21). Course staff post them (the action
   checks staff first); enrolled students read them on the course page,
   which is gated by getCourseForUser. */

export interface AnnouncementView {
  id: string;
  courseId: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: Date;
}

/* The announcement, and a notification for every student actively
   enrolled in the course while it's published (a draft course's students
   can't open it yet), for the caller's batch with its audit row. */
export function postAnnouncementStatements(input: { id: string; courseId: string; authorId: string; title: string; body: string }) {
  const url = `/courses/${input.courseId}?tab=announcements`;
  return [
    db.insert(announcements).values(input),
    db.execute(sql`
      insert into notifications (user_id, kind, title, url)
      select distinct e.user_id, 'announcement'::notification_kind, c.code || ' · ' || ${clip(input.title, 100)}, ${url}
      from enrollments e
      join sections s on s.id = e.section_id
      join courses c on c.id = s.course_id
      where s.course_id = ${input.courseId} and e.status = 'active' and c.status = 'published' and e.user_id <> ${input.authorId}`),
  ] as const;
}

/* A course's announcements, newest first, only when `visible` (the
   viewer is in the course: canSeeCourse). */
export function courseAnnouncementsQuery(courseId: string, visible: SQL, limit = 20) {
  return db
    .select({
      id: announcements.id,
      courseId: announcements.courseId,
      title: announcements.title,
      body: announcements.body,
      authorName: users.name,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.authorId))
    .where(and(eq(announcements.courseId, courseId), visible))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(limit);
}

export interface StaffAnnouncementView extends AnnouncementView {
  courseCode: string;
}

/* Announcements in the courses this viewer teaches (Messages). */
export async function staffAnnouncements(viewer: Viewer, limit = 30): Promise<StaffAnnouncementView[]> {
  return db
    .select({
      id: announcements.id,
      courseId: announcements.courseId,
      courseCode: courses.code,
      title: announcements.title,
      body: announcements.body,
      authorName: users.name,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .innerJoin(courses, eq(courses.id, announcements.courseId))
    .innerJoin(users, eq(users.id, announcements.authorId))
    .where(staffPredicate(viewer))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(limit);
}

/* An announcement in a course this viewer teaches, for deleting it. */
export async function announcementForStaff(id: string, viewer: Viewer): Promise<{ id: string; courseId: string } | null> {
  const [row] = await db
    .select({ id: announcements.id, courseId: announcements.courseId })
    .from(announcements)
    .innerJoin(courses, eq(courses.id, announcements.courseId))
    .where(and(eq(announcements.id, id), staffPredicate(viewer)))
    .limit(1);
  return row ?? null;
}

export function deleteAnnouncementStatement(id: string) {
  return db.delete(announcements).where(eq(announcements.id, id));
}
