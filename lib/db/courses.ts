import "server-only";

import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "./client";
import {
  courses,
  enrollments,
  lessons,
  modules,
  sections,
  type Course,
  type Lesson,
  type Module,
  type User,
} from "./schema";

/* Scoped course queries (feature 07). Every read joins through
   course_staff or enrollments inside the SQL — never filter afterwards.
   Staff (course_staff, or any admin) see everything in their course.
   Students see a course only while enrolled (active) and published, and
   only published modules and lessons in it. */

export type Viewer = Pick<User, "id" | "role">;
export type CourseAccess = "staff" | "student";

export interface ModuleWithLessons extends Module {
  lessons: Lesson[];
}

export interface CourseForUser {
  course: Course;
  access: CourseAccess;
  modules: ModuleWithLessons[];
}

const uuid = z.uuid();
/* Route params are untrusted; a malformed id would be a Postgres error. */
export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

/* The correlated subqueries below name the outer row as `courses.id`
   literally: in a single-table select Drizzle renders ${courses.id} as a
   bare "id", which is ambiguous (or binds to the wrong table) inside them.
   Every query using these must select from the unaliased `courses` table. */
export function staffPredicate(viewer: Viewer): SQL {
  if (viewer.role === "admin") return sql`true`;
  return sql`exists (select 1 from course_staff cs where cs.course_id = courses.id and cs.user_id = ${viewer.id})`;
}

export function enrolledPredicate(viewer: Viewer): SQL {
  return sql`exists (select 1 from enrollments e join sections s on s.id = e.section_id
    where s.course_id = courses.id and e.user_id = ${viewer.id} and e.status = 'active')`;
}

/* Who may see this course, decided in one query. */
function accessWhere(viewer: Viewer): SQL {
  return or(staffPredicate(viewer), and(eq(courses.status, "published"), enrolledPredicate(viewer)))!;
}

const lessonCount = sql<number>`(select count(*) from lessons l join modules m on m.id = l.module_id
  where m.course_id = courses.id)`.mapWith(Number);
const publishedLessonCount = sql<number>`(select count(*) from lessons l join modules m on m.id = l.module_id
  where m.course_id = courses.id and m.status = 'published' and l.status = 'published')`.mapWith(Number);

export async function listCoursesForStudent(userId: string) {
  return db
    .selectDistinct({ course: courses, lessonCount: publishedLessonCount })
    .from(courses)
    .innerJoin(sections, eq(sections.courseId, courses.id))
    .innerJoin(enrollments, eq(enrollments.sectionId, sections.id))
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.status, "active"), eq(courses.status, "published")),
    )
    .orderBy(asc(courses.title));
}

/* Courses the viewer teaches. Admins manage every course. */
export async function listCoursesForStaff(viewer: Viewer) {
  return db
    .select({ course: courses, lessonCount, publishedLessonCount })
    .from(courses)
    .where(staffPredicate(viewer))
    .orderBy(asc(courses.code));
}

export async function getCourseAccess(courseId: string, viewer: Viewer): Promise<CourseAccess | null> {
  if (!isUuid(courseId)) return null;
  const [row] = await db
    .select({ isStaff: sql<boolean>`${staffPredicate(viewer)}` })
    .from(courses)
    .where(and(eq(courses.id, courseId), accessWhere(viewer)))
    .limit(1);
  if (!row) return null;
  return row.isStaff ? "staff" : "student";
}

export async function isCourseStaff(courseId: string, viewer: Viewer): Promise<boolean> {
  return (await getCourseAccess(courseId, viewer)) === "staff";
}

export async function getCourseForUser(courseId: string, viewer: Viewer): Promise<CourseForUser | null> {
  if (!isUuid(courseId)) return null;
  const [row] = await db
    .select({ course: courses, isStaff: sql<boolean>`${staffPredicate(viewer)}` })
    .from(courses)
    .where(and(eq(courses.id, courseId), accessWhere(viewer)))
    .limit(1);
  if (!row) return null;

  const access: CourseAccess = row.isStaff ? "staff" : "student";
  const studentOnly = access === "student";

  const [mods, lessonRows] = await db.batch([
    db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, courseId), studentOnly ? eq(modules.status, "published") : undefined))
      .orderBy(asc(modules.position)),
    db
      .select({ lesson: lessons })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(
        and(
          eq(modules.courseId, courseId),
          studentOnly ? and(eq(modules.status, "published"), eq(lessons.status, "published")) : undefined,
        ),
      )
      .orderBy(asc(lessons.position)),
  ]);

  const byModule = new Map<string, Lesson[]>();
  for (const { lesson } of lessonRows) {
    const list = byModule.get(lesson.moduleId) ?? [];
    list.push(lesson);
    byModule.set(lesson.moduleId, list);
  }
  return {
    course: row.course,
    access,
    modules: mods.map((m) => ({ ...m, lessons: byModule.get(m.id) ?? [] })),
  };
}

export interface LessonForUser {
  lesson: Lesson;
  module: Module;
  course: Course;
  access: CourseAccess;
}

/* A student gets a lesson only when enrolled and the course, module and
   lesson are all published. Anything else is null (the page 404s). */
export async function getLessonForUser(lessonId: string, viewer: Viewer): Promise<LessonForUser | null> {
  if (!isUuid(lessonId)) return null;
  const isStaff = staffPredicate(viewer);
  const [row] = await db
    .select({ lesson: lessons, module: modules, course: courses, isStaff: sql<boolean>`${isStaff}` })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        eq(lessons.id, lessonId),
        or(
          isStaff,
          and(
            eq(courses.status, "published"),
            eq(modules.status, "published"),
            eq(lessons.status, "published"),
            enrolledPredicate(viewer),
          ),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { lesson: row.lesson, module: row.module, course: row.course, access: row.isStaff ? "staff" : "student" };
}

/* Resolve the owning course for a mutation's staff check. */
export async function courseIdForModule(moduleId: string): Promise<string | null> {
  if (!isUuid(moduleId)) return null;
  const [row] = await db.select({ courseId: modules.courseId }).from(modules).where(eq(modules.id, moduleId));
  return row?.courseId ?? null;
}

export async function courseIdForLesson(lessonId: string): Promise<string | null> {
  if (!isUuid(lessonId)) return null;
  const [row] = await db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(lessons.id, lessonId));
  return row?.courseId ?? null;
}
