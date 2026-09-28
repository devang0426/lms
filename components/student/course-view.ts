import type { CourseSummary, NextLesson } from "@/lib/db/catalog";
import type { CourseProgress } from "@/lib/db/progress";
import { plural, progressPercent } from "@/lib/utils/format";

/* View model for a student's course card. Completed lessons come from
   watch progress (feature 11). */
export interface StudentCourseView extends CourseSummary {
  completedLessons: number;
  percent: number;
  completed: boolean;
  next: NextLesson | null;
  lastWatchedAt: Date | null;
}

export function toStudentCourseView(
  summary: CourseSummary,
  next: NextLesson | undefined,
  progress: CourseProgress | undefined,
): StudentCourseView {
  const completedLessons = Math.min(progress?.completedLessons ?? 0, summary.lessonCount);
  const percent = progressPercent(completedLessons, summary.lessonCount);
  return {
    ...summary,
    completedLessons,
    percent,
    completed: summary.lessonCount > 0 && completedLessons >= summary.lessonCount,
    next: next ?? null,
    lastWatchedAt: progress?.lastWatchedAt ?? null,
  };
}

export function lessonHref(courseId: string, lessonId: string): string {
  return `/courses/${courseId}/lessons/${lessonId}`;
}

/* "DESIGN · 12 LESSONS" (uppercased by <Eyebrow>). */
export function courseEyebrow(c: CourseSummary): string {
  return [c.course.subject || c.course.code, plural(c.lessonCount, "lesson")].join(" · ");
}

/* "34% · next: Loops and ranges" */
export function courseProgressLine(c: StudentCourseView): string {
  if (c.lessonCount === 0) return "No lessons published yet";
  if (c.completed) return "Completed";
  return c.next ? `${c.percent}% · next: ${c.next.title}` : `${c.percent}%`;
}

/* "Continue learning": the unfinished course watched most recently, else
   the first unfinished course with a lesson to open. */
export function pickCurrentCourse(courses: StudentCourseView[]): StudentCourseView | null {
  const open = courses.filter((c) => !c.completed && c.next);
  const watched = open
    .filter((c) => c.lastWatchedAt)
    .sort((a, b) => b.lastWatchedAt!.getTime() - a.lastWatchedAt!.getTime());
  return watched[0] ?? open[0] ?? null;
}

export type CourseFilter = "in-progress" | "completed";

export function parseCourseFilter(value: unknown): CourseFilter {
  return value === "completed" ? "completed" : "in-progress";
}

export function filterCourses(courses: StudentCourseView[], filter: CourseFilter): StudentCourseView[] {
  return courses.filter((c) => (filter === "completed" ? c.completed : !c.completed));
}
