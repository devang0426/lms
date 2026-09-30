import "server-only";

import { or } from "drizzle-orm";
import { cache } from "react";
import { courseAnnouncementsQuery, type AnnouncementView } from "./announcements";
import { catalogCourseQuery, courseInstructorsQuery, inCatalogCourse, type CourseSummary } from "./catalog";
import { db } from "./client";
import { canSeeCourse, courseForUserQueries, isUuid, toCourseForUser, type CourseForUser, type Viewer } from "./courses";
import { completedLessonsQuery } from "./progress";

/* The course detail page (feature 29): one batch, so one round trip after
   the user lookup. Every statement checks access itself (invariant 4): the
   curriculum and announcements need the viewer in the course; the catalog
   entry and the instructors need the course in the catalog, or the viewer
   in it. Anything else is null (the page 404s). */

export interface CourseDetail {
  /* Enrolled students and staff: the full curriculum. */
  full: CourseForUser | null;
  /* Anyone else who can see the course in the catalog. */
  preview: CourseSummary | null;
  instructors: { name: string; imageUrl: string | null; role: "instructor" | "ta" }[];
  announcements: AnnouncementView[];
  /* The student's finished lessons; empty for staff. */
  completed: Set<string>;
}

export async function loadCourseDetail(courseId: string, viewer: Viewer): Promise<CourseDetail | null> {
  if (!isUuid(courseId)) return null;
  const inCourse = canSeeCourse(courseId, viewer);
  const [access, mods, lessonRows, [preview], instructors, announcements, completed] = await db.batch([
    ...courseForUserQueries(courseId, viewer),
    catalogCourseQuery(courseId, viewer),
    courseInstructorsQuery(courseId, or(inCourse, inCatalogCourse(courseId))!),
    courseAnnouncementsQuery(courseId, inCourse),
    completedLessonsQuery(viewer.id, courseId),
  ]);
  const full = toCourseForUser([access, mods, lessonRows]);
  if (!full && !preview) return null;
  return {
    full,
    preview: full ? null : preview,
    instructors,
    announcements: full ? announcements : [],
    completed: new Set(full?.access === "student" ? completed.map((r) => r.lessonId) : []),
  };
}

/* Once per request (feature 28): the course page and its layout's
   breadcrumb share this batch. Call it with the cached user object from
   lib/auth, so both get the same key. */
export const courseDetailFor = cache(loadCourseDetail);
