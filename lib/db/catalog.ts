import "server-only";

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { enrolledPredicate, isUuid, type Viewer } from "./courses";
import { courses, courseStaff, terms, users, type Course, type LessonKind } from "./schema";

/* Student-facing course summaries (feature 08): the catalog, the student
   home and course cards. Catalog fields (title, summary, outcomes,
   instructor, counts) of a published course in the current term are
   visible to every signed-in user; the curriculum and lessons still need
   an enrollment (lib/db/courses.ts). Raw subqueries reference `courses.id`
   literally — see the note in courses.ts. */

const publishedLessons = sql`from lessons l join modules m on m.id = l.module_id
  where m.course_id = courses.id and m.status = 'published' and l.status = 'published'`;

const lessonCount = sql<number>`(select count(*) ${publishedLessons})`.mapWith(Number);
const durationSec = sql<number>`(select coalesce(sum(l.duration_sec), 0) ${publishedLessons})`.mapWith(Number);
const instructorName = sql<string | null>`(select u.name from course_staff cs join users u on u.id = cs.user_id
  where cs.course_id = courses.id and cs.role = 'instructor' order by cs.created_at limit 1)`;

export interface CourseSummary {
  course: Course;
  lessonCount: number;
  durationSec: number;
  instructorName: string | null;
  enrolled: boolean;
}

function summaryFields(viewer: Viewer) {
  return {
    course: courses,
    lessonCount,
    durationSec,
    instructorName,
    enrolled: sql<boolean>`${enrolledPredicate(viewer)}`,
  };
}

const inCatalog = and(eq(courses.status, "published"), eq(terms.isCurrent, true));

export const CATALOG_SORTS = ["newest", "title", "shortest"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogFilters {
  q?: string;
  subject?: string;
  level?: string;
  sort?: CatalogSort;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* Published courses in the current term, filtered by the URL params. */
export async function listCatalog(viewer: Viewer, filters: CatalogFilters): Promise<CourseSummary[]> {
  const where: (SQL | undefined)[] = [inCatalog];
  const q = filters.q?.trim();
  if (q) {
    const p = `%${escapeLike(q)}%`;
    where.push(or(ilike(courses.title, p), ilike(courses.code, p), ilike(courses.subject, p), ilike(courses.summary, p)));
  }
  if (filters.subject) where.push(eq(courses.subject, filters.subject));
  if (filters.level) where.push(eq(courses.level, filters.level));

  const order =
    filters.sort === "title"
      ? [asc(courses.title)]
      : filters.sort === "shortest"
        ? [asc(durationSec), asc(courses.title)]
        : [desc(courses.createdAt), asc(courses.title)];

  return db
    .select(summaryFields(viewer))
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(and(...where))
    .orderBy(...order);
}

/* Subject chips and level options for the catalog filter bar. */
export async function catalogFacets(): Promise<{ subjects: string[]; levels: string[] }> {
  const rows = await db
    .selectDistinct({ subject: courses.subject, level: courses.level })
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(inCatalog);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { subjects: uniq(rows.map((r) => r.subject)), levels: uniq(rows.map((r) => r.level)) };
}

/* One catalog entry (course detail for a student who isn't enrolled). */
export async function getCatalogCourse(courseId: string, viewer: Viewer): Promise<CourseSummary | null> {
  if (!isUuid(courseId)) return null;
  const [row] = await db
    .select(summaryFields(viewer))
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(and(eq(courses.id, courseId), inCatalog))
    .limit(1);
  return row ?? null;
}

export interface NextLesson {
  courseId: string;
  lessonId: string;
  title: string;
  kind: LessonKind;
  durationSec: number | null;
  moduleTitle: string;
}

/* Enrolled, published courses for the student home and My courses. */
export async function listEnrolledSummaries(viewer: Viewer): Promise<CourseSummary[]> {
  return db
    .select(summaryFields(viewer))
    .from(courses)
    .where(and(eq(courses.status, "published"), enrolledPredicate(viewer)))
    .orderBy(asc(courses.title));
}

/* Instructors of a course, for the course detail Instructor tab. Only call
   after the viewer has been shown the course. */
export async function listCourseInstructors(courseId: string) {
  return db
    .select({ name: users.name, imageUrl: users.imageUrl, role: courseStaff.role })
    .from(courseStaff)
    .innerJoin(users, eq(users.id, courseStaff.userId))
    .where(eq(courseStaff.courseId, courseId))
    .orderBy(asc(courseStaff.role), asc(courseStaff.createdAt));
}
