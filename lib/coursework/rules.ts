import type { AssignmentCategory, SubmissionStatus } from "@/lib/db/schema";

/* Coursework rules (feature 20). Pure and shared: the server decides with
   these, and the pages use the same functions to explain the decision.
   Times are epoch milliseconds. */

export const CATEGORY_LABELS: Record<AssignmentCategory, string> = {
  homework: "Homework",
  project: "Project",
  quiz: "Quiz",
  exam: "Exam",
};

/* "Due soon" (the butter badge) = within three days and not yet past. */
export const DUE_SOON_MS = 3 * 86_400_000;

export type DueState = "overdue" | "soon" | "later";

export function dueState(dueAt: number, now: number): DueState {
  if (now > dueAt) return "overdue";
  return dueAt - now <= DUE_SOON_MS ? "soon" : "later";
}

/* "Due in 2 days", "Due in 5 hours", "Past due". Whole units, rounded down. */
export function dueLabel(dueAt: number, now: number): string {
  const left = dueAt - now;
  if (left < 0) return "Past due";
  const hours = Math.floor(left / 3_600_000);
  if (hours < 1) return "Due within the hour";
  if (hours < 48) return `Due in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `Due in ${Math.floor(hours / 24)} days`;
}

export type SubmitCheck = { ok: true; late: boolean } | { ok: false; reason: "locked" | "closed" };

/* May the student hand in (or replace) their work now? A submission is
   locked once it has a grade, draft or returned. After the due date it's
   accepted only when late work is allowed, and then flagged late. */
export function submitCheck(
  input: { dueAt: number; allowLate: boolean; status: SubmissionStatus | null },
  now: number,
): SubmitCheck {
  if (input.status === "graded" || input.status === "returned") return { ok: false, reason: "locked" };
  const late = now > input.dueAt;
  if (late && !input.allowLate) return { ok: false, reason: "closed" };
  return { ok: true, late };
}

export const SUBMIT_MESSAGES: Record<"locked" | "closed", string> = {
  locked: "This work has been graded, so it can't be changed.",
  closed: "The due date has passed, and this assignment doesn't take late work.",
};

/* Points as people write them: 10, 7.5, 8.25. */
export function formatPoints(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/* A typed score: a number from 0 to max with at most two decimals. */
export function parseScore(raw: string, max: number): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= max ? n : null;
}

/* What a student sees for one piece of their work. */
export type WorkState =
  | { kind: "returned"; score: number; maxScore: number }
  | { kind: "handed_in"; late: boolean }
  | { kind: "missing" }
  | { kind: "open" };

export function workState(
  input: { dueAt: number; submission: { status: SubmissionStatus; late: boolean } | null; grade: { score: number; maxScore: number } | null },
  now: number,
): WorkState {
  const { submission, grade } = input;
  if (submission?.status === "returned" && grade) return { kind: "returned", score: grade.score, maxScore: grade.maxScore };
  if (submission) return { kind: "handed_in", late: submission.late };
  return now > input.dueAt ? { kind: "missing" } : { kind: "open" };
}
