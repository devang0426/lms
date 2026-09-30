import "server-only";

import type { CalendarEvent } from "@/lib/calendar";
import { enrolledSummariesQuery } from "@/lib/db/catalog";
import { db } from "@/lib/db/client";
import type { Viewer } from "@/lib/db/courses";
import { toEvents, upcomingEventsQuery } from "@/lib/db/events";
import { courseProgressQuery, nextLessonsQuery, toCourseProgress, toNextLessons } from "@/lib/db/progress";
import { toStudentCourseView, type StudentCourseView } from "./course-view";

/* The student's enrolled courses with watch progress and the lesson to
   continue (feature 11). The progress reads filter on the enrollment
   subquery rather than the ids of the first read, so all of it is one
   batch: one round trip (feature 29). */

function courseQueries(viewer: Viewer) {
  return [enrolledSummariesQuery(viewer), courseProgressQuery(viewer.id), nextLessonsQuery(viewer.id)] as const;
}

function toCourses(
  summaries: Awaited<ReturnType<typeof enrolledSummariesQuery>>,
  progressRows: Awaited<ReturnType<typeof courseProgressQuery>>,
  nextRows: Awaited<ReturnType<typeof nextLessonsQuery>>,
): StudentCourseView[] {
  const progress = toCourseProgress(progressRows);
  const next = toNextLessons(nextRows);
  return summaries.map((s) => toStudentCourseView(s, next.get(s.course.id), progress.get(s.course.id)));
}

export async function loadStudentCourses(viewer: Viewer): Promise<StudentCourseView[]> {
  const [summaries, progress, next] = await db.batch(courseQueries(viewer));
  return toCourses(summaries, progress, next);
}

/* The student home: the courses and the next few calendar events. */
export async function loadStudentHome(viewer: Viewer, from: Date, events: number): Promise<{ courses: StudentCourseView[]; comingUp: CalendarEvent[] }> {
  const [summaries, progress, next, upcoming] = await db.batch([...courseQueries(viewer), upcomingEventsQuery(viewer, from, events)]);
  return { courses: toCourses(summaries, progress, next), comingUp: toEvents(upcoming) };
}
