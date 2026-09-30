import { dueState } from "@/lib/coursework/rules";
import type { LessonKind } from "@/lib/db/schema";

/* The student's "Next up" on /progress (feature 31), pure. One suggestion
   across their courses, in this order:
   1. Work due within three days that isn't handed in (the soonest first):
      a deadline can't wait.
   2. The lesson to continue: in the course watched most recently, the
      same lesson "Continue learning" opens on the home page.
   3. A weak topic to review (mastery under 50%), the weakest first, at
      the moment it's taught.
   4. Otherwise, all caught up. */

export interface NextUpCourse {
  courseId: string;
  code: string;
  /* The lesson "Continue" opens (lib/db/progress.ts nextLessonsQuery). */
  nextLesson: { lessonId: string; title: string; moduleTitle: string; kind: LessonKind } | null;
  /* When the student last watched anything here. */
  lastWatchedAt: Date | null;
  work: { lessonId: string; title: string; kind: "assignment" | "quiz"; dueAt: Date; handedIn: boolean }[];
  /* Tried topics, weakest first (lib/progress/report.ts courseMastery). */
  topics: { topic: string; pct: number; tone: "clay" | "butter" | "sage"; lessonId: string; startSec: number | null }[];
}

export type NextUp =
  | { kind: "work"; courseId: string; code: string; lessonId: string; title: string; work: "assignment" | "quiz"; dueAt: Date }
  | { kind: "lesson"; courseId: string; code: string; lessonId: string; title: string; moduleTitle: string; lessonKind: LessonKind }
  | { kind: "review"; courseId: string; code: string; lessonId: string; topic: string; pct: number; startSec: number | null }
  | { kind: "done" };

export function nextUp(courses: NextUpCourse[], now: number): NextUp {
  const due = courses
    .flatMap((c) => c.work.filter((w) => !w.handedIn && dueState(w.dueAt.getTime(), now) === "soon").map((w) => ({ c, w })))
    .sort((a, b) => a.w.dueAt.getTime() - b.w.dueAt.getTime())[0];
  if (due) {
    return { kind: "work", courseId: due.c.courseId, code: due.c.code, lessonId: due.w.lessonId, title: due.w.title, work: due.w.kind, dueAt: due.w.dueAt };
  }

  const open = courses.filter((c) => c.nextLesson);
  const current =
    open.filter((c) => c.lastWatchedAt).sort((a, b) => b.lastWatchedAt!.getTime() - a.lastWatchedAt!.getTime())[0] ?? open[0];
  if (current?.nextLesson) {
    const l = current.nextLesson;
    return { kind: "lesson", courseId: current.courseId, code: current.code, lessonId: l.lessonId, title: l.title, moduleTitle: l.moduleTitle, lessonKind: l.kind };
  }

  const weak = courses
    .flatMap((c) => c.topics.filter((t) => t.tone === "clay").map((t) => ({ c, t })))
    .sort((a, b) => a.t.pct - b.t.pct)[0];
  if (weak) {
    return { kind: "review", courseId: weak.c.courseId, code: weak.c.code, lessonId: weak.t.lessonId, topic: weak.t.topic, pct: weak.t.pct, startSec: weak.t.startSec };
  }
  return { kind: "done" };
}

/* Where the suggestion opens: the lesson, at the topic's moment for a review. */
export function nextUpHref(next: Exclude<NextUp, { kind: "done" }>): string {
  const base = `/courses/${next.courseId}/lessons/${next.lessonId}`;
  return next.kind === "review" && next.startSec !== null ? `${base}?t=${Math.floor(next.startSec)}` : base;
}
