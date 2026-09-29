import { describe, expect, it } from "vitest";
import { courseCompletion, overallCompletion, waitedFor } from "@/lib/dashboard/stats";
import { dropOffBin, groupTopics, heatStrip, refusalRate, type QuestionFact } from "./index";

describe("heatStrip", () => {
  it("counts the viewers who watched at least half of each slice", () => {
    // 100 s in 4 slices of 25 s.
    const viewers: [number, number][][] = [
      [[0, 100]], // all of it
      [[0, 60]], // slices 0 and 1; only 10 s of slice 2 (under half)
      [[0, 30], [80, 100]], // slice 0, not 1 (5 s of 25), slice 3 (20 s)
    ];
    expect(heatStrip(viewers, 100, 4)).toEqual([3, 2, 1, 2]);
  });

  it("is empty for no video or no viewers", () => {
    expect(heatStrip([], 100, 3)).toEqual([0, 0, 0]);
    expect(heatStrip([[[0, 10]]], 0, 3)).toEqual([0, 0, 0]);
  });
});

describe("dropOffBin", () => {
  it("finds where fewer than half are still watching", () => {
    expect(dropOffBin([4, 4, 3, 1, 1], 4)).toBe(3);
    expect(dropOffBin([4, 4, 4, 4], 4)).toBeNull();
    expect(dropOffBin([1, 1, 0], 4)).toBeNull(); // most never started
    expect(dropOffBin([], 0)).toBeNull();
  });
});

describe("groupTopics", () => {
  const lessons = new Map([
    [
      "L1",
      {
        title: "Linear combinations and span",
        chapters: [
          { title: "Vectors", startSec: 0 },
          { title: "Span", startSec: 300 },
        ],
      },
    ],
    ["L2", { title: "Notation guide", chapters: [] }],
  ]);
  const q = (over: Partial<QuestionFact>): QuestionFact => ({ refused: false, lessonId: "L1", startSec: 10, document: false, ...over });

  it("groups answered questions by the chapter their answer cited", () => {
    const topics = groupTopics(
      [q({ startSec: 310 }), q({ startSec: 300 }), q({ startSec: 12 }), q({ lessonId: "L2", startSec: null, document: true }), q({ refused: true }), q({ lessonId: null })],
      lessons,
    );
    expect(topics).toEqual([
      { lessonId: "L1", lessonTitle: "Linear combinations and span", chapterTitle: "Span", questions: 2 },
      { lessonId: "L1", lessonTitle: "Linear combinations and span", chapterTitle: "Vectors", questions: 1 },
      { lessonId: "L2", lessonTitle: "Notation guide", chapterTitle: null, questions: 1 },
    ]);
  });

  it("computes the refusal rate", () => {
    expect(refusalRate([q({ refused: true }), q({}), q({}), q({})])).toBe(0.25);
    expect(refusalRate([])).toBeNull();
  });
});

describe("dashboard stats", () => {
  it("averages completion per enrollment", () => {
    // 2 students × 4 lessons, 3 lessons done in total → 38%.
    expect(courseCompletion({ courseId: "a", learners: 2, lessons: 4, completions: 3 })).toBe(38);
    expect(courseCompletion({ courseId: "a", learners: 0, lessons: 4, completions: 0 })).toBeNull();
    // Course a: 3/4 + 0/4 per student; course b: 1 student, 1/2. (0.75 + 0 + 0.5) / 3 = 42%.
    expect(
      overallCompletion([
        { courseId: "a", learners: 2, lessons: 4, completions: 3 },
        { courseId: "b", learners: 1, lessons: 2, completions: 1 },
        { courseId: "c", learners: 5, lessons: 0, completions: 0 },
      ]),
    ).toBe(42);
    expect(overallCompletion([])).toBeNull();
  });

  it("says how long work has waited", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(waitedFor(now - 10 * 60_000, now)).toBe("under an hour");
    expect(waitedFor(now - 5 * 3_600_000, now)).toBe("5 hours");
    expect(waitedFor(now - 3 * 86_400_000, now)).toBe("3 days");
  });
});
