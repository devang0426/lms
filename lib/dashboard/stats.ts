/* The instructor dashboard's numbers (feature 22). Pure: completion is the
   average over enrollments (a student in two courses counts twice) of
   completed published lessons ÷ published lessons in that course. */

export interface CourseFacts {
  courseId: string;
  /* Students actively enrolled. */
  learners: number;
  /* Published lessons (course, module and lesson published). */
  lessons: number;
  /* Completed published lessons, summed over its enrolled students. */
  completions: number;
}

/* A course's average completion, 0–100, or null when nobody's enrolled
   or nothing is published. */
export function courseCompletion(c: CourseFacts): number | null {
  if (c.learners === 0 || c.lessons === 0) return null;
  return Math.round((c.completions / (c.learners * c.lessons)) * 100);
}

/* One student's completion in one course (feature 31), by the same rule:
   completed published lessons ÷ published lessons, 0–100, or null when
   nothing is published. Averaged over a course's students (before
   rounding), it is courseCompletion. */
export function learnerCompletion(completed: number, lessons: number): number | null {
  if (lessons === 0) return null;
  return Math.round((completed / lessons) * 100);
}

/* Across courses, each enrollment weighs the same. */
export function overallCompletion(courses: CourseFacts[]): number | null {
  const counted = courses.filter((c) => c.learners > 0 && c.lessons > 0);
  const enrollments = counted.reduce((n, c) => n + c.learners, 0);
  if (enrollments === 0) return null;
  const sum = counted.reduce((n, c) => n + c.completions / c.lessons, 0);
  return Math.round((sum / enrollments) * 100);
}

/* "2 days", "5 hours", "under an hour": how long the oldest item has waited. */
export function waitedFor(since: number, now: number): string {
  const hours = Math.floor(Math.max(0, now - since) / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${Math.floor(hours / 24)} days`;
}
