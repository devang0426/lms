import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import {
  buildGradebook,
  categoryWeights,
  courseTotal,
  formatPercent,
  gradebookCsv,
  gradebookFileName,
  weightPercents,
  type GradebookItem,
  type WorkFact,
} from "./gradebook";
import { dueLabel, dueState, formatPoints, parseScore, submitCheck, workState } from "./rules";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 8, 29, 12);

describe("due dates", () => {
  it("is due soon within three days, overdue after", () => {
    expect(dueState(now + 4 * DAY, now)).toBe("later");
    expect(dueState(now + 3 * DAY, now)).toBe("soon");
    expect(dueState(now + HOUR, now)).toBe("soon");
    expect(dueState(now - 1, now)).toBe("overdue");
  });

  it("labels the time left", () => {
    expect(dueLabel(now + 5 * DAY + HOUR, now)).toBe("Due in 5 days");
    expect(dueLabel(now + 30 * HOUR, now)).toBe("Due in 30 hours");
    expect(dueLabel(now + HOUR, now)).toBe("Due in 1 hour");
    expect(dueLabel(now + 10 * 60_000, now)).toBe("Due within the hour");
    expect(dueLabel(now - 1, now)).toBe("Past due");
  });
});

describe("submitCheck", () => {
  const due = now + DAY;

  it("takes work before the due date, not late", () => {
    expect(submitCheck({ dueAt: due, allowLate: false, status: null }, now)).toEqual({ ok: true, late: false });
    // Replacing an ungraded submission is allowed.
    expect(submitCheck({ dueAt: due, allowLate: false, status: "submitted" }, now)).toEqual({ ok: true, late: false });
  });

  it("flags work after the due date as late, or refuses it", () => {
    const after = due + 1;
    expect(submitCheck({ dueAt: due, allowLate: true, status: null }, after)).toEqual({ ok: true, late: true });
    expect(submitCheck({ dueAt: due, allowLate: false, status: null }, after)).toEqual({ ok: false, reason: "closed" });
  });

  it("locks graded work, draft or returned", () => {
    expect(submitCheck({ dueAt: due, allowLate: true, status: "graded" }, now)).toEqual({ ok: false, reason: "locked" });
    expect(submitCheck({ dueAt: due, allowLate: true, status: "returned" }, now)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("scores", () => {
  it("parses a score from 0 to max with two decimals at most", () => {
    expect(parseScore("7.5", 10)).toBe(7.5);
    expect(parseScore(" 10 ", 10)).toBe(10);
    expect(parseScore("0", 10)).toBe(0);
    expect(parseScore("10.5", 10)).toBeNull();
    expect(parseScore("-1", 10)).toBeNull();
    expect(parseScore("7.555", 10)).toBeNull();
    expect(parseScore("", 10)).toBeNull();
    expect(parseScore("abc", 10)).toBeNull();
  });

  it("formats points without trailing zeros", () => {
    expect(formatPoints(10)).toBe("10");
    expect(formatPoints(7.5)).toBe("7.5");
    expect(formatPoints(8.254)).toBe("8.25");
  });

  it("shows a student only a returned grade", () => {
    const grade = { score: 8, maxScore: 10 };
    expect(workState({ dueAt: now + DAY, submission: { status: "returned", late: false }, grade }, now)).toEqual({
      kind: "returned",
      score: 8,
      maxScore: 10,
    });
    // A draft grade stays hidden: the student sees "handed in".
    expect(workState({ dueAt: now + DAY, submission: { status: "graded", late: true }, grade }, now)).toEqual({
      kind: "handed_in",
      late: true,
    });
    expect(workState({ dueAt: now + DAY, submission: null, grade: null }, now)).toEqual({ kind: "open" });
    expect(workState({ dueAt: now - DAY, submission: null, grade: null }, now)).toEqual({ kind: "missing" });
  });
});

describe("totals and weights", () => {
  it("weighs categories equally by default, and rows override", () => {
    const equal = categoryWeights([]);
    expect(weightPercents(equal)).toEqual({ homework: 25, project: 25, quiz: 25, exam: 25 });
    const custom = categoryWeights([{ category: "exam", weight: 2 }]);
    expect(weightPercents(custom)).toEqual({ homework: 20, project: 20, quiz: 20, exam: 40 });
  });

  it("averages only the categories that have counted work", () => {
    const weights = categoryWeights([]);
    const total = courseTotal(
      [
        { category: "homework", score: 8, maxScore: 10 },
        { category: "homework", score: 10, maxScore: 10 },
        { category: "quiz", score: 3, maxScore: 5 },
      ],
      weights,
    );
    expect(total.byCategory).toEqual({ homework: 90, quiz: 60 });
    expect(total.percent).toBe(75);
    expect(courseTotal([], weights).percent).toBeNull();
  });

  it("uses the weights", () => {
    const weights = categoryWeights([{ category: "exam", weight: 3 }]);
    const total = courseTotal(
      [
        { category: "homework", score: 10, maxScore: 10 },
        { category: "exam", score: 50, maxScore: 100 },
      ],
      weights,
    );
    expect(total.percent).toBeCloseTo((100 * 1 + 50 * 3) / 4);
    expect(formatPercent(85.66)).toBe("85.7%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("buildGradebook", () => {
  const items: GradebookItem[] = [
    { id: "a1", kind: "assignment", title: "Problem set 1", category: "homework", points: 10, dueAt: now - DAY },
    { id: "a2", kind: "assignment", title: "Project", category: "project", points: 20, dueAt: now + DAY },
    { id: "q1", kind: "quiz", title: "Span quiz", category: "quiz", points: 5, dueAt: now - DAY },
  ];
  const students = [
    { id: "s1", name: "Aanya Sharma", email: "aanya@example.com" },
    { id: "s2", name: "Ben Ortiz", email: "ben@example.com" },
  ];
  const fact = (f: Partial<WorkFact> & Pick<WorkFact, "userId" | "itemId" | "status">): WorkFact => ({
    late: false,
    score: null,
    maxScore: null,
    submissionId: null,
    ...f,
  });

  it("counts returned grades and quizzes, and marks everything else", () => {
    const rows = buildGradebook({
      students,
      items,
      weights: categoryWeights([]),
      now,
      facts: [
        fact({ userId: "s1", itemId: "a1", status: "returned", score: 8, maxScore: 10, late: true, submissionId: "sub1" }),
        fact({ userId: "s1", itemId: "a2", status: "submitted", submissionId: "sub2" }),
        fact({ userId: "s1", itemId: "q1", status: "quiz", score: 4, maxScore: 5 }),
        fact({ userId: "s2", itemId: "a1", status: "graded", score: 9, maxScore: 10, submissionId: "sub3" }),
      ],
    });
    expect(rows[0].cells.map((c) => c.kind)).toEqual(["score", "to_grade", "score"]);
    expect(rows[0].cells[0]).toMatchObject({ late: true, submissionId: "sub1" });
    expect(rows[0].total.percent).toBe(80);
    // A draft grade is shown to staff but not counted; the quiz wasn't taken.
    expect(rows[1].cells.map((c) => c.kind)).toEqual(["draft", "none", "missing"]);
    expect(rows[1].total.percent).toBeNull();
  });

  it("exports a CSV with points possible and counted scores only", () => {
    const rows = buildGradebook({
      students,
      items,
      weights: categoryWeights([]),
      now,
      facts: [
        fact({ userId: "s1", itemId: "a1", status: "returned", score: 7.5, maxScore: 10, submissionId: "sub1" }),
        fact({ userId: "s2", itemId: "a1", status: "graded", score: 9, maxScore: 10, submissionId: "sub3" }),
      ],
    });
    const csv = gradebookCsv(items, rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Student,Email,Problem set 1 (Homework),Project (Project),Span quiz (Quiz),Total %",
      "Points possible,,10,20,5,",
      "Aanya Sharma,aanya@example.com,7.5,,,75",
      "Ben Ortiz,ben@example.com,,,,",
      "",
    ]);
  });

  it("names the file after the course and date", () => {
    expect(gradebookFileName("MATH 201", new Date(now))).toBe("math-201-gradebook-2026-09-29.csv");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Sharma, Aanya")).toBe('"Sharma, Aanya"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(" padded")).toBe('" padded"');
  });

  it("defuses formulas in text but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("writes a BOM and CRLF line ends", () => {
    expect(toCsv([["a", 1], ["Zoë", null]])).toBe("﻿a,1\r\nZoë,\r\n");
  });
});
