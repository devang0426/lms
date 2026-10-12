import "server-only";

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Block } from "@/lib/ai/types";
import { db } from "./client";
import { canSeeCourse, courseForUserQueries, isUuid, toCourseForUser, type Viewer } from "./courses";
import { lessons, modules, notes, type Course } from "./schema";

/* Course notes download (feature 36): the published study notes of a
   course's lessons, combined into one file. Everyone, staff included,
   gets the published notes of published lessons only: the download is
   what students study from, never an unreviewed draft. Every statement
   checks access itself (invariant 4). */

/* At most this many lessons in one download; a course has far fewer. */
export const MAX_EXPORT_LESSONS = 300;

function publishedNotesWhere(courseId: string, viewer: Viewer): SQL {
  return and(
    eq(modules.courseId, courseId),
    canSeeCourse(courseId, viewer),
    eq(modules.status, "published"),
    eq(lessons.status, "published"),
    eq(notes.status, "published"),
    sql`jsonb_array_length(${notes.blocks}) > 0`,
  )!;
}

/* The lessons with notes to download, for the course page's batch. */
export function courseNoteLessonsQuery(courseId: string, viewer: Viewer) {
  return db
    .select({ lessonId: lessons.id })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(publishedNotesWhere(courseId, viewer));
}

export interface CourseNotesLesson {
  /* The lesson's place in the viewer's curriculum, as the course page counts it. */
  number: number;
  title: string;
  moduleTitle: string;
  blocks: Block[];
}

export interface CourseNotes {
  course: Course;
  lessons: CourseNotesLesson[];
}

/* The chosen lessons' notes in curriculum order, in one round trip: the
   access check and the curriculum (for order and numbering) beside the
   notes. `lessonIds` null means every lesson with notes; ids outside the
   course or without published notes are skipped. Null when the viewer
   can't see the course. */
export async function loadCourseNotes(courseId: string, viewer: Viewer, lessonIds: string[] | null): Promise<CourseNotes | null> {
  if (!isUuid(courseId)) return null;
  const where = publishedNotesWhere(courseId, viewer);
  const [access, mods, lessonRows, noteRows] = await db.batch([
    ...courseForUserQueries(courseId, viewer),
    db
      .select({ lessonId: notes.lessonId, blocks: notes.blocks })
      .from(notes)
      .innerJoin(lessons, eq(lessons.id, notes.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(lessonIds ? and(where, inArray(lessons.id, lessonIds)) : where),
  ]);
  const found = toCourseForUser([access, mods, lessonRows]);
  if (!found) return null;
  const blocksFor = new Map(noteRows.map((r) => [r.lessonId, r.blocks]));
  const out: CourseNotesLesson[] = [];
  let number = 0;
  for (const m of found.modules) {
    for (const lesson of m.lessons) {
      number += 1;
      const blocks = blocksFor.get(lesson.id);
      if (blocks) out.push({ number, title: lesson.title, moduleTitle: m.title, blocks });
    }
  }
  return { course: found.course, lessons: out };
}
