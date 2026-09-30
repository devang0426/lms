import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./client";
import { courses, courseStaff, type Course } from "./schema";

/* The courses this person is on the staff of, published first, then the
   most recently changed (feature 28, "View as student"). Admins get only
   their own, not everyone's. */
export async function taughtCourses(userId: string): Promise<Pick<Course, "id" | "code" | "title" | "status">[]> {
  return db
    .select({ id: courses.id, code: courses.code, title: courses.title, status: courses.status })
    .from(courses)
    .innerJoin(courseStaff, and(eq(courseStaff.courseId, courses.id), eq(courseStaff.userId, userId)))
    .orderBy(desc(courses.status), desc(courses.updatedAt), asc(courses.code));
}
