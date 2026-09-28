import "server-only";

import { and, asc, eq, ilike, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "./client";
import { isUuid } from "./courses";
import { courses, enrollments, sections, users } from "./schema";

/* Enrollment management (admin screens, feature 07). Callers must have
   checked requireRole("admin") first — these are not scoped to a viewer. */

export async function getCourseWithSections(courseId: string) {
  if (!isUuid(courseId)) return null;
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return null;
  const courseSections = await db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId))
    .orderBy(asc(sections.name));
  return { course, sections: courseSections };
}

export async function listEnrolledStudents(courseId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      imageUrl: users.imageUrl,
      sectionId: sections.id,
      sectionName: sections.name,
      enrolledAt: enrollments.enrolledAt,
    })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(and(eq(sections.courseId, courseId), eq(enrollments.status, "active")))
    .orderBy(asc(users.name));
}

/* Students matching a name/email search who aren't enrolled yet. */
export async function searchStudentsToEnroll(courseId: string, query: string, limit = 10) {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const enrolled = db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .where(and(eq(sections.courseId, courseId), eq(enrollments.status, "active")));

  return db
    .select({ id: users.id, name: users.name, email: users.email, imageUrl: users.imageUrl })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        or(ilike(users.name, pattern), ilike(users.email, pattern)),
        notInArray(users.id, enrolled),
      ),
    )
    .orderBy(asc(users.name))
    .limit(limit);
}

export async function listAllCoursesWithEnrollment() {
  return db
    .select({
      course: courses,
      students: sql<number>`(select count(distinct e.user_id) from enrollments e join sections s on s.id = e.section_id
        where s.course_id = courses.id and e.status = 'active')`.mapWith(Number),
    })
    .from(courses)
    .orderBy(asc(courses.code));
}
