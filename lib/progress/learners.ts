import { csvFileName, toCsv, type CsvCell } from "@/lib/coursework/csv";
import { courseCompletion, learnerCompletion } from "@/lib/dashboard/stats";
import type { PublishStatus } from "@/lib/db/schema";

/* The teacher's Learners table (feature 31), pure. One row per student
   actively enrolled in a course, with the numbers the data layer counts
   (lib/db/learners.ts). Every count is over the course's published
   lessons (module and lesson published), the dashboard's rule, so a
   course's average of these completions is its dashboard completion. */

export interface LearnerFacts {
  userId: string;
  name: string;
  email: string;
  /* "Section A", or "Section A, Section B" if enrolled in two. */
  sections: string;
  /* The latest watch, card review, quiz or hand-in in this course. Assistant
     chats are left out: nothing here comes from them. */
  lastActivityAt: Date | null;
  /* Completed published lessons. */
  completed: number;
  /* Submitted quiz attempts (practice and graded) on published lessons. */
  quizAttempts: number;
  /* Their mean score, 0–1. */
  quizAverage: number | null;
  /* Submissions to published assignments, whatever their state. */
  handedIn: number;
  /* Of those, the ones whose grade has been returned to the student. */
  graded: number;
  /* Published assignments past their due date with nothing handed in. */
  missing: number;
}

export interface LearnerRow extends LearnerFacts {
  /* 0–100, or null when nothing is published. */
  completion: number | null;
  /* 0–100, or null with no attempts. */
  quizPercent: number | null;
}

export interface CourseLearners {
  course: { id: string; code: string; title: string; status: PublishStatus };
  /* Published lessons. */
  lessons: number;
  /* Published assignments. */
  assignments: number;
  learners: LearnerRow[];
}

export function toLearnerRow(facts: LearnerFacts, lessons: number): LearnerRow {
  return {
    ...facts,
    completion: learnerCompletion(facts.completed, lessons),
    quizPercent: facts.quizAverage === null ? null : Math.round(facts.quizAverage * 100),
  };
}

/* The course's average completion, as the dashboard shows it. */
export function averageCompletion(c: Pick<CourseLearners, "course" | "lessons" | "learners">): number | null {
  return courseCompletion({
    courseId: c.course.id,
    learners: c.learners.length,
    lessons: c.lessons,
    completions: c.learners.reduce((n, l) => n + l.completed, 0),
  });
}

/* 2026-09-30T14:05:09Z → "2026-09-30 14:05", in UTC (the CSV says so). */
function utcMinute(at: Date): string {
  return at.toISOString().slice(0, 16).replace("T", " ");
}

/* One row per student, Excel-safe (lib/coursework/csv.ts: a name like
   "=HYPERLINK(…)" stays text). */
export function learnersCsv(data: Pick<CourseLearners, "lessons" | "learners">): string {
  const header: CsvCell[] = [
    "Student",
    "Email",
    "Section",
    "Last activity (UTC)",
    "Lessons completed",
    "Lessons published",
    "Completion %",
    "Quiz attempts",
    "Average quiz %",
    "Assignments handed in",
    "Assignments graded",
    "Assignments missing",
  ];
  const body = data.learners.map((l): CsvCell[] => [
    l.name,
    l.email,
    l.sections,
    l.lastActivityAt ? utcMinute(l.lastActivityAt) : null,
    l.completed,
    data.lessons,
    l.completion,
    l.quizAttempts,
    l.quizPercent,
    l.handedIn,
    l.graded,
    l.missing,
  ]);
  return toCsv([header, ...body]);
}

export function learnersFileName(courseCode: string, now: Date): string {
  return csvFileName(courseCode, "learners", now);
}
