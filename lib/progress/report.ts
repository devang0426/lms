import type { QuizAttempt, QuizQuestion } from "@/lib/ai/types";
import { categoryWeights, courseTotal, type Weights } from "@/lib/coursework/gradebook";
import type { AssignmentCategory, LessonKind, SubmissionStatus, WatchedRange } from "@/lib/db/schema";
import { masteryByTopic, masteryColor } from "@/lib/study/mastery";
import { watchedFraction } from "@/lib/video/watch";

/* One student's progress in one course (feature 31), pure. The teacher's
   student report and the student's own /progress page read the same facts
   (lib/db/learners.ts) and shape them here, so the two always agree. */

/* ---- Lessons ------------------------------------------------------------------ */

/* A published lesson with the student's watch_progress row, if any. */
export interface LessonFact {
  courseId: string;
  moduleId: string;
  moduleTitle: string;
  modulePos: number;
  lessonId: string;
  title: string;
  kind: LessonKind;
  lessonPos: number;
  durationSec: number | null;
  completedAt: Date | null;
  watchedRanges: WatchedRange[] | null;
  updatedAt: Date | null;
}

export type LessonState = "done" | "started" | "not_started";

export interface LessonProgressView {
  lessonId: string;
  title: string;
  kind: LessonKind;
  state: LessonState;
  /* Share of a video watched, 0–100; null for other lessons, or before any
     watching. */
  watchedPct: number | null;
  completedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface ModuleProgress {
  moduleId: string;
  title: string;
  lessons: LessonProgressView[];
}

function lessonView(f: LessonFact): LessonProgressView {
  const state: LessonState = f.completedAt ? "done" : f.updatedAt ? "started" : "not_started";
  const watched =
    f.kind === "video" && f.watchedRanges && f.durationSec && f.durationSec > 0
      ? Math.round(watchedFraction(f.watchedRanges, f.durationSec) * 100)
      : null;
  return {
    lessonId: f.lessonId,
    title: f.title,
    kind: f.kind,
    state,
    watchedPct: state === "not_started" ? null : watched,
    completedAt: f.completedAt,
    lastSeenAt: f.updatedAt,
  };
}

/* Lessons in course order, grouped by module. */
export function lessonProgress(facts: LessonFact[]): ModuleProgress[] {
  const ordered = [...facts].sort((a, b) => a.modulePos - b.modulePos || a.lessonPos - b.lessonPos);
  const modules: ModuleProgress[] = [];
  for (const f of ordered) {
    let mod = modules.at(-1);
    if (!mod || mod.moduleId !== f.moduleId) {
      mod = { moduleId: f.moduleId, title: f.moduleTitle, lessons: [] };
      modules.push(mod);
    }
    mod.lessons.push(lessonView(f));
  }
  return modules;
}

export function completedCount(facts: Pick<LessonFact, "completedAt">[]): number {
  return facts.filter((f) => f.completedAt).length;
}

/* ---- Quiz mastery across the course --------------------------------------------- */

/* A published quiz question on one of the course's published lessons. */
export interface MasteryQuestion {
  id: string;
  topic: string;
  lessonId: string;
  modulePos: number;
  lessonPos: number;
  startSec: number | null;
}

/* One answer from the student's submitted attempts. */
export interface MasteryAnswer {
  questionId: string;
  correct: boolean;
}

export interface CourseTopicMastery {
  topic: string;
  correct: number;
  total: number;
  pct: number;
  tone: "clay" | "butter" | "sage";
  /* Where it's first taught in the course: the earliest lesson with a
     question on it, and the earliest moment in that lesson. */
  lessonId: string;
  startSec: number | null;
}

const topicName = (topic: string) => topic.trim() || "General";

/* Mastery per topic over the whole course, by lib/study/mastery.ts. A topic
   asked in two lessons is one topic. Only topics the student has answered
   are returned, weakest first. */
export function courseMastery(questions: MasteryQuestion[], answers: MasteryAnswer[]): CourseTopicMastery[] {
  const ordered = [...questions].sort(
    (a, b) => a.modulePos - b.modulePos || a.lessonPos - b.lessonPos || (a.startSec ?? Infinity) - (b.startSec ?? Infinity),
  );
  const topicOf = new Map(ordered.map((q) => [q.id, topicName(q.topic)]));
  const firstTaught = new Map<string, { lessonId: string; startSec: number | null }>();
  for (const q of ordered) {
    const topic = topicName(q.topic);
    if (!firstTaught.has(topic)) firstTaught.set(topic, { lessonId: q.lessonId, startSec: q.startSec });
  }

  const asQuestions: QuizQuestion[] = ordered.map((q) => ({
    id: q.id,
    noteId: "",
    type: "mcq",
    topic: topicName(q.topic),
    difficulty: "basic",
    question: "",
    options: [],
    correctIndex: 0,
    explanation: "",
  }));
  const asAttempts: QuizAttempt[] = answers
    .filter((a) => topicOf.has(a.questionId))
    .map((a, i) => ({ id: String(i), noteId: "", questionId: a.questionId, topic: topicOf.get(a.questionId)!, correct: a.correct, at: 0 }));

  return masteryByTopic(asQuestions, asAttempts)
    .filter((m) => m.total > 0)
    .map((m) => ({ ...m, tone: masteryColor(m.pct), ...firstTaught.get(m.topic)! }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total || a.topic.localeCompare(b.topic));
}

/* Topics with a published question that the student hasn't answered yet. */
export function untriedTopics(questions: Pick<MasteryQuestion, "topic">[], mastery: Pick<CourseTopicMastery, "topic">[]): number {
  const tried = new Set(mastery.map((m) => m.topic));
  return new Set(questions.map((q) => topicName(q.topic)).filter((t) => !tried.has(t))).size;
}

/* ---- Grades so far (the student's own view) ------------------------------------ */

/* What the student may see of one assignment or graded quiz: a score only
   once returned (lib/db/grades.ts studentGradeRows). */
export interface OwnGradeItem {
  kind: "assignment" | "quiz";
  category: AssignmentCategory;
  dueAt: Date;
  status: SubmissionStatus | null;
  score: number | null;
  maxScore: number | null;
}

export interface GradesSoFar {
  /* Weighted course total, 0–100, as on /grades; null before anything counts. */
  percent: number | null;
  graded: number;
  /* Handed in, grade not back yet. */
  waiting: number;
  /* Past due, nothing handed in. */
  missing: number;
  /* Not due yet, nothing handed in. */
  open: number;
}

export function gradesSoFar(items: OwnGradeItem[], weightRows: { category: AssignmentCategory; weight: number }[], now: number): GradesSoFar {
  const counted = items.flatMap((r) => (r.score !== null && r.maxScore !== null ? [{ category: r.category, score: r.score, maxScore: r.maxScore }] : []));
  const weights: Weights = categoryWeights(weightRows);
  let waiting = 0;
  let missing = 0;
  let open = 0;
  for (const r of items) {
    if (r.score !== null) continue;
    if (r.status) waiting++;
    else if (now > r.dueAt.getTime()) missing++;
    else open++;
  }
  return { percent: courseTotal(counted, weights).percent, graded: counted.length, waiting, missing, open };
}
