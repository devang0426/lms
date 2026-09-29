import type { AssignmentCategory, SubmissionStatus } from "@/lib/db/schema";
import { toCsv, type CsvCell } from "./csv";
import { CATEGORY_LABELS, formatPoints } from "./rules";

/* The gradebook (feature 20), pure. What counts toward a total is what
   the student can see: returned assignment grades and graded quizzes
   (best attempt × points). Each category is points earned ÷ points
   possible over its counted items; the total averages the categories
   that have counted work, by weight. Weights default to equal (the
   grading scheme is an open question). */

export const CATEGORY_ORDER: AssignmentCategory[] = ["homework", "project", "quiz", "exam"];

export type Weights = Record<AssignmentCategory, number>;

/* A course's weights: its grade_categories rows, 1 for any category
   without a row (so no rows = equal). */
export function categoryWeights(rows: { category: AssignmentCategory; weight: number }[]): Weights {
  const weights: Weights = { homework: 1, project: 1, quiz: 1, exam: 1 };
  for (const r of rows) weights[r.category] = Math.max(0, r.weight);
  return weights;
}

/* Each category's share, as whole-ish percentages for display ("25%"). */
export function weightPercents(weights: Weights): Record<AssignmentCategory, number> {
  const sum = CATEGORY_ORDER.reduce((n, c) => n + weights[c], 0);
  const out = { homework: 0, project: 0, quiz: 0, exam: 0 };
  for (const c of CATEGORY_ORDER) out[c] = sum > 0 ? Math.round((weights[c] / sum) * 1000) / 10 : 0;
  return out;
}

export interface CountedItem {
  category: AssignmentCategory;
  score: number;
  maxScore: number;
}

export interface CourseTotal {
  /* 0–100, or null when nothing counted yet. */
  percent: number | null;
  byCategory: Partial<Record<AssignmentCategory, number>>;
}

export function courseTotal(items: CountedItem[], weights: Weights): CourseTotal {
  const sums = new Map<AssignmentCategory, { score: number; max: number }>();
  for (const it of items) {
    if (it.maxScore <= 0) continue;
    const s = sums.get(it.category) ?? { score: 0, max: 0 };
    s.score += it.score;
    s.max += it.maxScore;
    sums.set(it.category, s);
  }
  const byCategory: CourseTotal["byCategory"] = {};
  let weighted = 0;
  let weightSum = 0;
  for (const c of CATEGORY_ORDER) {
    const s = sums.get(c);
    if (!s) continue;
    const pct = (s.score / s.max) * 100;
    byCategory[c] = pct;
    weighted += pct * weights[c];
    weightSum += weights[c];
  }
  return { percent: weightSum > 0 ? weighted / weightSum : null, byCategory };
}

/* 85.66… → "85.7%". */
export function formatPercent(pct: number | null): string {
  return pct === null ? "—" : `${Math.round(pct * 10) / 10}%`;
}

/* ---- Building the table ------------------------------------------------------ */

export interface GradebookItem {
  id: string;
  kind: "assignment" | "quiz";
  title: string;
  category: AssignmentCategory;
  points: number;
  dueAt: number;
}

/* One student's work on one item, as the data layer reads it. Quizzes
   arrive as `quiz` with their best score already × points. */
export interface WorkFact {
  userId: string;
  itemId: string;
  status: SubmissionStatus | "quiz";
  late: boolean;
  score: number | null;
  maxScore: number | null;
  /* The submission, for linking a cell to the grade view. */
  submissionId: string | null;
}

export type GradebookCell =
  | { kind: "score"; score: number; maxScore: number; late: boolean; submissionId: string | null }
  | { kind: "draft"; score: number; maxScore: number; late: boolean; submissionId: string }
  | { kind: "to_grade"; late: boolean; submissionId: string }
  | { kind: "missing" }
  | { kind: "none" };

export interface GradebookStudent {
  id: string;
  name: string;
  email: string;
}

export interface GradebookRow {
  student: GradebookStudent;
  cells: GradebookCell[];
  total: CourseTotal;
}

function cellFor(fact: WorkFact | undefined, item: GradebookItem, now: number): GradebookCell {
  if (!fact) return now > item.dueAt ? { kind: "missing" } : { kind: "none" };
  const graded = fact.score !== null && fact.maxScore !== null;
  if (fact.status === "quiz" || fact.status === "returned") {
    if (graded) return { kind: "score", score: fact.score!, maxScore: fact.maxScore!, late: fact.late, submissionId: fact.submissionId };
  }
  if (fact.status === "graded" && graded && fact.submissionId) {
    return { kind: "draft", score: fact.score!, maxScore: fact.maxScore!, late: fact.late, submissionId: fact.submissionId };
  }
  if (fact.submissionId) return { kind: "to_grade", late: fact.late, submissionId: fact.submissionId };
  return now > item.dueAt ? { kind: "missing" } : { kind: "none" };
}

export function buildGradebook(input: {
  students: GradebookStudent[];
  items: GradebookItem[];
  facts: WorkFact[];
  weights: Weights;
  now: number;
}): GradebookRow[] {
  const byKey = new Map(input.facts.map((f) => [`${f.userId}:${f.itemId}`, f]));
  return input.students.map((student) => {
    const cells = input.items.map((item) => cellFor(byKey.get(`${student.id}:${item.id}`), item, input.now));
    const counted: CountedItem[] = [];
    cells.forEach((cell, i) => {
      if (cell.kind === "score") counted.push({ category: input.items[i].category, score: cell.score, maxScore: cell.maxScore });
    });
    return { student, cells, total: courseTotal(counted, input.weights) };
  });
}

/* ---- CSV export ---------------------------------------------------------------- */

/* One row per student: each item's counted score (blank when there isn't
   one), then the total. The second row holds the points possible. */
export function gradebookCsv(items: GradebookItem[], rows: GradebookRow[]): string {
  const header: CsvCell[] = ["Student", "Email", ...items.map((it) => `${it.title} (${CATEGORY_LABELS[it.category]})`), "Total %"];
  const possible: CsvCell[] = ["Points possible", "", ...items.map((it) => it.points), ""];
  const body = rows.map((r) => [
    r.student.name,
    r.student.email,
    ...r.cells.map((c) => (c.kind === "score" ? Number(formatPoints(c.score)) : null)),
    r.total.percent === null ? null : Math.round(r.total.percent * 10) / 10,
  ]);
  return toCsv([header, possible, ...body]);
}

/* "MATH 201" on 29 Sep 2026 → "math-201-gradebook-2026-09-29.csv". */
export function gradebookFileName(courseCode: string, now: Date): string {
  const code = courseCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  return `${code}-gradebook-${now.toISOString().slice(0, 10)}.csv`;
}
