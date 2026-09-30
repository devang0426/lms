import { describe, expect, it } from "vitest";
import { courseCompletion, learnerCompletion } from "@/lib/dashboard/stats";
import { averageCompletion, learnersCsv, learnersFileName, toLearnerRow, type LearnerFacts } from "./learners";
import { nextUp, nextUpHref, type NextUpCourse } from "./next-up";
import { completedCount, courseMastery, gradesSoFar, lessonProgress, untriedTopics, type LessonFact, type MasteryQuestion } from "./report";

/* Feature 31: the Learners table, the student report and /progress. */

const NOW = Date.parse("2026-09-30T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function facts(over: Partial<LearnerFacts> = {}): LearnerFacts {
  return {
    userId: "u1",
    name: "Aanya Sharma",
    email: "aanya@example.com",
    sections: "Section A",
    lastActivityAt: null,
    completed: 0,
    quizAttempts: 0,
    quizAverage: null,
    handedIn: 0,
    graded: 0,
    missing: 0,
    ...over,
  };
}

describe("learner numbers", () => {
  it("uses the dashboard's completion rule, so a course's average matches it", () => {
    expect(learnerCompletion(5, 12)).toBe(42);
    expect(learnerCompletion(0, 0)).toBeNull();
    const learners = [toLearnerRow(facts({ completed: 1 }), 3), toLearnerRow(facts({ userId: "u2", completed: 3 }), 3)];
    const course = { course: { id: "c", code: "MATH 201", title: "Linear Algebra", status: "published" as const }, lessons: 3, learners };
    expect(averageCompletion(course)).toBe(courseCompletion({ courseId: "c", learners: 2, lessons: 3, completions: 4 }));
    expect(averageCompletion(course)).toBe(67);
    expect(averageCompletion({ ...course, learners: [] })).toBeNull();
  });

  it("turns the mean quiz score into a whole percentage", () => {
    expect(toLearnerRow(facts({ quizAttempts: 3, quizAverage: 0.6667 }), 3).quizPercent).toBe(67);
    expect(toLearnerRow(facts(), 3).quizPercent).toBeNull();
    expect(toLearnerRow(facts(), 0).completion).toBeNull();
  });
});

describe("learnersCsv", () => {
  it("writes one Excel-safe row per student", () => {
    const rows = [
      toLearnerRow(
        facts({
          name: "=HYPERLINK(\"http://x\",\"hi\")",
          sections: "Section A, Section B",
          lastActivityAt: new Date("2026-09-30T14:05:09.123Z"),
          completed: 2,
          quizAttempts: 1,
          quizAverage: 0.5,
          handedIn: 1,
          graded: 1,
          missing: 1,
        }),
        4,
      ),
      toLearnerRow(facts({ userId: "u2", name: "Rohan" }), 4),
    ];
    const csv = learnersCsv({ lessons: 4, learners: rows });
    expect(csv.startsWith("﻿Student,Email,Section,Last activity (UTC),")).toBe(true);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"",""hi"")",aanya@example.com,"Section A, Section B",2026-09-30 14:05,2,4,50,1,50,1,1,1`);
    expect(lines[2]).toBe("Rohan,aanya@example.com,Section A,,0,4,0,0,,0,0,0");
    expect(lines.at(-1)).toBe("");
  });

  it("names the file after the course and the day", () => {
    expect(learnersFileName("MATH 201", new Date(NOW))).toBe("math-201-learners-2026-09-30.csv");
  });
});

function lesson(over: Partial<LessonFact>): LessonFact {
  return {
    courseId: "c",
    moduleId: "m1",
    moduleTitle: "Vectors",
    modulePos: 0,
    lessonId: "l1",
    title: "Lesson",
    kind: "video",
    lessonPos: 0,
    durationSec: 600,
    completedAt: null,
    watchedRanges: null,
    updatedAt: null,
    ...over,
  };
}

describe("lessonProgress", () => {
  it("groups lessons by module in course order, with what each student did", () => {
    const modules = lessonProgress([
      lesson({ moduleId: "m2", moduleTitle: "Matrices", modulePos: 1, lessonId: "l4", title: "Inverses" }),
      lesson({ lessonId: "l2", lessonPos: 1, title: "Span", watchedRanges: [[0, 150], [300, 450]], updatedAt: new Date(NOW) }),
      lesson({ lessonId: "l1", title: "Vectors", completedAt: new Date(NOW), watchedRanges: [[0, 600]], updatedAt: new Date(NOW) }),
      lesson({ lessonId: "l3", lessonPos: 2, title: "Notation", kind: "reading", durationSec: null, updatedAt: new Date(NOW) }),
    ]);
    expect(modules.map((m) => [m.title, m.lessons.map((l) => l.title)])).toEqual([
      ["Vectors", ["Vectors", "Span", "Notation"]],
      ["Matrices", ["Inverses"]],
    ]);
    const [vectors, span, notation] = modules[0].lessons;
    expect(vectors).toMatchObject({ state: "done", watchedPct: 100 });
    expect(span).toMatchObject({ state: "started", watchedPct: 50 });
    expect(notation).toMatchObject({ state: "started", watchedPct: null });
    expect(modules[1].lessons[0]).toMatchObject({ state: "not_started", watchedPct: null });
  });

  it("counts completed lessons", () => {
    expect(completedCount([lesson({ completedAt: new Date(NOW) }), lesson({}), lesson({ completedAt: new Date(NOW) })])).toBe(2);
  });
});

function question(over: Partial<MasteryQuestion>): MasteryQuestion {
  return { id: "q", topic: "Span", lessonId: "l1", modulePos: 0, lessonPos: 0, startSec: null, ...over };
}

describe("courseMastery", () => {
  const questions = [
    question({ id: "q1", topic: "Span", lessonId: "l2", lessonPos: 1, startSec: 90 }),
    question({ id: "q2", topic: " Span ", lessonId: "l1", startSec: 400 }),
    question({ id: "q3", topic: "Span", lessonId: "l1", startSec: 120 }),
    question({ id: "q4", topic: "Basis", lessonId: "l2", lessonPos: 1, startSec: 30 }),
    question({ id: "q5", topic: "", lessonId: "l2", lessonPos: 1 }),
    question({ id: "q6", topic: "Rank", lessonId: "l2", lessonPos: 1 }),
  ];

  it("rolls answers up per topic across lessons, weakest first, answered topics only", () => {
    const mastery = courseMastery(questions, [
      { questionId: "q1", correct: true },
      { questionId: "q2", correct: false },
      { questionId: "q3", correct: true },
      { questionId: "q3", correct: true },
      { questionId: "q4", correct: false },
      { questionId: "q5", correct: true },
      { questionId: "gone", correct: false },
    ]);
    expect(mastery.map((m) => [m.topic, m.correct, m.total, m.pct, m.tone])).toEqual([
      ["Basis", 0, 1, 0, "clay"],
      ["Span", 3, 4, 75, "butter"],
      ["General", 1, 1, 100, "sage"],
    ]);
    // Where Span is first taught: the earliest lesson, then its earliest moment.
    expect(mastery[1]).toMatchObject({ lessonId: "l1", startSec: 120 });
    expect(untriedTopics(questions, mastery)).toBe(1);
  });

  it("is empty before any answer", () => {
    expect(courseMastery(questions, [])).toEqual([]);
    expect(untriedTopics(questions, [])).toBe(4);
  });
});

describe("gradesSoFar", () => {
  it("totals what the student can see and counts the rest", () => {
    const due = (days: number) => new Date(NOW + days * DAY);
    const g = gradesSoFar(
      [
        { kind: "assignment", category: "homework", dueAt: due(-5), status: "returned", score: 8, maxScore: 10 },
        { kind: "quiz", category: "quiz", dueAt: due(-2), status: "returned", score: 3, maxScore: 5 },
        { kind: "assignment", category: "project", dueAt: due(-1), status: "graded", score: null, maxScore: null },
        { kind: "assignment", category: "exam", dueAt: due(-1), status: null, score: null, maxScore: null },
        { kind: "assignment", category: "exam", dueAt: due(2), status: null, score: null, maxScore: null },
      ],
      [],
      NOW,
    );
    // Homework 80% and quiz 60%, equal weights.
    expect(g).toEqual({ percent: 70, graded: 2, waiting: 1, missing: 1, open: 1 });
    expect(gradesSoFar([], [], NOW).percent).toBeNull();
  });
});

function course(over: Partial<NextUpCourse>): NextUpCourse {
  return { courseId: "c1", code: "MATH 201", nextLesson: null, lastWatchedAt: null, work: [], topics: [], ...over };
}

const LESSON = { lessonId: "l2", title: "Span", moduleTitle: "Vectors", kind: "video" as const };

describe("nextUp", () => {
  it("puts work due within three days first, soonest first", () => {
    const next = nextUp(
      [
        course({
          nextLesson: LESSON,
          work: [
            { lessonId: "a1", title: "Problem set 1", kind: "assignment", dueAt: new Date(NOW + 30 * HOUR), handedIn: false },
            { lessonId: "a2", title: "Handed in", kind: "assignment", dueAt: new Date(NOW + 2 * HOUR), handedIn: true },
            { lessonId: "a3", title: "Overdue", kind: "assignment", dueAt: new Date(NOW - 2 * HOUR), handedIn: false },
            { lessonId: "a4", title: "Next week", kind: "assignment", dueAt: new Date(NOW + 7 * DAY), handedIn: false },
          ],
        }),
        course({ courseId: "c2", code: "PHYS 101", work: [{ lessonId: "q1", title: "Quiz 1", kind: "quiz", dueAt: new Date(NOW + 10 * HOUR), handedIn: false }] }),
      ],
      NOW,
    );
    expect(next).toMatchObject({ kind: "work", courseId: "c2", lessonId: "q1", work: "quiz" });
  });

  it("then continues the lesson in the course watched most recently", () => {
    const next = nextUp(
      [
        course({ nextLesson: { ...LESSON, lessonId: "old" }, lastWatchedAt: new Date(NOW - 5 * DAY) }),
        course({ courseId: "c2", code: "PHYS 101", nextLesson: LESSON, lastWatchedAt: new Date(NOW - DAY) }),
        course({ courseId: "c3", code: "CHEM 110", nextLesson: { ...LESSON, lessonId: "never" } }),
      ],
      NOW,
    );
    expect(next).toMatchObject({ kind: "lesson", courseId: "c2", lessonId: "l2", title: "Span", moduleTitle: "Vectors" });
    expect(nextUp([course({ nextLesson: LESSON })], NOW)).toMatchObject({ kind: "lesson", courseId: "c1" });
  });

  it("then reviews the weakest topic under 50%, at its moment", () => {
    const next = nextUp(
      [
        course({
          topics: [
            { topic: "Basis", pct: 40, tone: "clay", lessonId: "l1", startSec: 125.4 },
            { topic: "Span", pct: 60, tone: "butter", lessonId: "l1", startSec: 10 },
          ],
        }),
        course({ courseId: "c2", topics: [{ topic: "Rank", pct: 20, tone: "clay", lessonId: "l9", startSec: null }] }),
      ],
      NOW,
    );
    expect(next).toMatchObject({ kind: "review", courseId: "c2", topic: "Rank" });
    const basis = nextUp([course({ topics: [{ topic: "Basis", pct: 40, tone: "clay", lessonId: "l1", startSec: 125.4 }] })], NOW);
    expect(basis.kind === "review" && nextUpHref(basis)).toBe("/courses/c1/lessons/l1?t=125");
  });

  it("is all caught up otherwise", () => {
    expect(nextUp([course({ topics: [{ topic: "Span", pct: 90, tone: "sage", lessonId: "l1", startSec: 0 }] })], NOW)).toEqual({ kind: "done" });
    expect(nextUp([], NOW)).toEqual({ kind: "done" });
  });

  it("links to the lesson", () => {
    expect(nextUpHref({ kind: "lesson", courseId: "c1", code: "MATH 201", lessonId: "l2", title: "Span", moduleTitle: "Vectors", lessonKind: "video" })).toBe(
      "/courses/c1/lessons/l2",
    );
  });
});
