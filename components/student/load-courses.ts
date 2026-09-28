import "server-only";

import { listEnrolledSummaries } from "@/lib/db/catalog";
import type { Viewer } from "@/lib/db/courses";
import { courseProgressFor, nextLessonsFor } from "@/lib/db/progress";
import { toStudentCourseView, type StudentCourseView } from "./course-view";

/* The student's enrolled courses with watch progress and the lesson to
   continue (feature 11). */
export async function loadStudentCourses(viewer: Viewer): Promise<StudentCourseView[]> {
  const summaries = await listEnrolledSummaries(viewer);
  const ids = summaries.map((s) => s.course.id);
  const [progress, next] = await Promise.all([courseProgressFor(viewer.id, ids), nextLessonsFor(viewer.id, ids)]);
  return summaries.map((s) => toStudentCourseView(s, next.get(s.course.id), progress.get(s.course.id)));
}
