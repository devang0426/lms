/* Quiz answers (feature 16). Pure: used by the server to score every
   answer, and by the practice runner for instant feedback.

   An answer is the chosen option's index ("2") for mcq and true_false, or
   the typed text for fill_blank, whose one correct answer is options[0]. */

export type QuizQuestionType = "mcq" | "true_false" | "fill_blank";
export type QuizLevel = "basic" | "intermediate" | "exam";

/* What a student may see before answering. For a graded quiz this is all
   the browser gets: no correct index, no explanation, and no options for
   fill_blank (its only option IS the answer). */
export interface QuestionView {
  id: string;
  type: QuizQuestionType;
  difficulty: QuizLevel;
  topic: string;
  question: string;
  options: string[];
  startSec: number | null;
}

/* Practice questions carry their answers: feedback is instant, and the
   server re-scores the set when it's saved. */
export interface PracticeQuestion extends QuestionView {
  correctIndex: number;
  explanation: string;
}

export interface AnswerFeedback {
  questionId: string;
  answer: string;
  correct: boolean;
  /* null on a graded attempt until its answers are revealed (feature 24). */
  correctAnswer: string | null;
  explanation: string | null;
  startSec: number | null;
}

export interface TopicMasteryView {
  topic: string;
  correct: number;
  total: number;
  pct: number;
  tone: "clay" | "butter" | "sage";
  /* Where the topic is taught, for "Review in video". */
  startSec: number | null;
}

/* A graded quiz as the student's Quiz tab lists it. */
export interface GradedQuizSummary {
  id: string;
  title: string;
  dueAt: number;
  points: number;
  maxAttempts: number;
  questionCount: number;
  attemptsUsed: number;
  /* Best submitted score, 0–1. */
  best: number | null;
  /* An attempt started and not yet submitted: "Continue" resumes it. */
  openAttemptId: string | null;
}

/* ---- Graded quizzes: the deadline and the reveal (feature 24, S4) ------------
   An attempt may be submitted until the due date plus a short grace
   period, so one started just before the deadline can still be handed in.
   Correct answers and explanations are revealed only when that window has
   closed for everyone. Before then a submit returns the score and which
   answers were wrong, nothing more: otherwise a blank first attempt would
   give away the answers for the next one, and for classmates. */

export const GRADED_GRACE_MS = 10 * 60 * 1000;

export function submitDeadline(dueAt: number): number {
  return dueAt + GRADED_GRACE_MS;
}

export function submitOpen(dueAt: number, now: number): boolean {
  return now < submitDeadline(dueAt);
}

export function answersRevealed(dueAt: number, now: number): boolean {
  return !submitOpen(dueAt, now);
}

type Scored = {
  q: Checkable & { id: string; explanation: string; startSec: number | null };
  answer: string;
  correct: boolean;
};

/* A graded attempt's feedback, in the quiz's order. Right or wrong per
   question always; the correct answer and explanation only once revealed. */
export function gradedFeedback(scored: Scored[], questionIds: string[], revealed: boolean): AnswerFeedback[] {
  const order = new Map(questionIds.map((id, i) => [id, i]));
  return [...scored]
    .sort((a, b) => (order.get(a.q.id) ?? 0) - (order.get(b.q.id) ?? 0))
    .map((s) => ({
      questionId: s.q.id,
      answer: s.answer,
      correct: s.correct,
      correctAnswer: revealed ? correctAnswerText(s.q) : null,
      explanation: revealed ? s.q.explanation : null,
      startSec: s.q.startSec,
    }));
}

type Checkable = { type: QuizQuestionType; options: string[]; correctIndex: number };

export function isCorrect(q: Checkable, answer: string): boolean {
  if (q.type === "fill_blank") return sameAnswer(answer, q.options[0] ?? "");
  const index = Number(answer.trim());
  return Number.isInteger(index) && index === q.correctIndex;
}

export function correctAnswerText(q: Checkable): string {
  return q.options[q.type === "fill_blank" ? 0 : q.correctIndex] ?? "";
}

/* ---- Fill in the blank -------------------------------------------------------
   Case, spacing, punctuation at the ends, a leading "a/an/the", $…$ maths
   delimiters and simple number formats ("0.50" = ".5" = "1/2",
   "1,000" = "1000") don't matter. */

export function sameAnswer(given: string, expected: string): boolean {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (a === "" || b === "") return false;
  if (a === b) return true;
  const x = parseNumber(a);
  const y = parseNumber(b);
  return x !== null && y !== null && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
}

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[−–—]/g, "-")
    .trim()
    .replace(/^\$+|\$+$/g, "")
    .replace(/^["'`(]+|["'`).,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:a|an|the) /, "")
    .trim();
}

export function parseNumber(s: string): number | null {
  const t = s.replace(/\s+/g, "").replace(/^\+/, "");
  if (/^-?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/.test(t) && /\d/.test(t)) {
    return Number(t.replace(/,/g, ""));
  }
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}
