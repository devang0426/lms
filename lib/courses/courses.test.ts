import { describe, expect, it } from "vitest";
import { ADDABLE_LESSON_KINDS, goesLive, publishRefusal, VIDEO_FIRST } from "./lessons";
import { setupComplete, setupSteps, type CourseSetupFacts } from "./setup";

describe("publishRefusal", () => {
  it("refuses a video lesson without a ready video (V4)", () => {
    expect(publishRefusal({ kind: "video", status: "draft" }, false)).toBe(VIDEO_FIRST);
    expect(publishRefusal({ kind: "video", status: "published" }, false)).toBe(VIDEO_FIRST);
    expect(publishRefusal({ kind: "video", status: "ready" }, true)).toBeNull();
  });

  it("refuses a lesson that is still processing", () => {
    expect(publishRefusal({ kind: "video", status: "processing" }, true)).toMatch(/still processing/);
  });

  it("lets other kinds publish without a video", () => {
    for (const kind of ["reading", "assignment", "quiz"] as const) {
      expect(publishRefusal({ kind, status: "draft" }, false)).toBeNull();
    }
  });
});

describe("lesson kinds", () => {
  it("no longer offers Quiz (V5)", () => {
    expect(ADDABLE_LESSON_KINDS).toEqual(["video", "reading", "assignment"]);
  });
});

describe("goesLive", () => {
  it("lists the lesson and each kind of draft", () => {
    expect(goesLive({ notes: 1, cards: 24, questions: 1 })).toEqual(["the lesson", "its notes", "24 flashcards", "1 quiz question"]);
    expect(goesLive({ notes: 0, cards: 1, questions: 24 })).toEqual(["the lesson", "1 flashcard", "24 quiz questions"]);
    expect(goesLive({ notes: 0, cards: 0, questions: 0 })).toEqual(["the lesson"]);
  });
});

const empty: CourseSetupFacts = {
  courseId: "c1",
  hasDetails: false,
  modules: 0,
  lectures: 0,
  reviewLessonId: null,
  reviewed: false,
  live: false,
  students: 0,
};
const all: CourseSetupFacts = { ...empty, hasDetails: true, modules: 2, lectures: 1, reviewLessonId: "l1", reviewed: true, live: true, students: 3 };

describe("setupSteps", () => {
  it("has the six steps in order, the first one current", () => {
    const steps = setupSteps(empty, { canEnroll: true });
    expect(steps.map((s) => s.key)).toEqual(["details", "module", "lecture", "review", "publish", "students"]);
    expect(steps.map((s) => s.current)).toEqual([true, false, false, false, false, false]);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(setupComplete(steps)).toBe(false);
  });

  it("marks steps done from the data, in any order, and points at the first gap", () => {
    const steps = setupSteps({ ...empty, hasDetails: true, modules: 1, students: 2 }, { canEnroll: false });
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false, false, true]);
    expect(steps.find((s) => s.current)?.key).toBe("lecture");
    expect(steps.find((s) => s.key === "students")?.hint).toBe("2 students are enrolled.");
  });

  it("is complete when everything is done", () => {
    const steps = setupSteps(all, { canEnroll: true });
    expect(setupComplete(steps)).toBe(true);
    expect(steps.some((s) => s.current)).toBe(false);
  });

  it("links to the pages that do each step", () => {
    const byKey = Object.fromEntries(setupSteps(all, { canEnroll: true }).map((s) => [s.key, s.href]));
    expect(byKey).toEqual({
      details: "/instructor/courses/c1?tab=details",
      module: "/instructor/courses/c1",
      lecture: "/instructor/courses/c1",
      review: "/instructor/courses/c1/lessons/l1/review",
      publish: "/instructor/courses/c1",
      students: "/admin/courses/c1/enrollments",
    });
  });

  it("has no review link before there's a lecture, and no enroll link for instructors", () => {
    const steps = setupSteps(empty, { canEnroll: false });
    expect(steps.find((s) => s.key === "review")).toMatchObject({ href: null, action: null });
    expect(steps.find((s) => s.key === "students")).toMatchObject({ href: null, action: null, hint: "An admin enrolls students or imports a roster." });
  });
});
