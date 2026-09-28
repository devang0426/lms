import { describe, expect, it } from "vitest";
import { firstName, formatClock, formatLength, formatLessonLength, greetingFor, plural, progressPercent } from "./format";

describe("formatLength", () => {
  it("formats hours and minutes like the wireframes", () => {
    expect(formatLength(13200)).toBe("3h 40m");
    expect(formatLength(3120)).toBe("52m");
    expect(formatLength(21600)).toBe("6h");
  });
  it("is empty for no duration", () => {
    expect(formatLength(0)).toBe("");
    expect(formatLength(20)).toBe("");
  });
});

describe("formatLessonLength", () => {
  it("rounds to whole minutes, at least 1", () => {
    expect(formatLessonLength(840)).toBe("14 min");
    expect(formatLessonLength(25)).toBe("1 min");
  });
  it("is empty when unknown", () => {
    expect(formatLessonLength(null)).toBe("");
    expect(formatLessonLength(0)).toBe("");
  });
});

describe("greetingFor", () => {
  it("changes with the time of day", () => {
    expect(greetingFor(4)).toBe("Good evening");
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
  });
});

describe("progressPercent", () => {
  it("divides completed by published lessons", () => {
    expect(progressPercent(0, 5)).toBe(0);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(5, 5)).toBe(100);
  });
  it("is 0 with no lessons and never over 100", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(9, 5)).toBe(100);
  });
});

describe("plural / firstName", () => {
  it("pluralises", () => {
    expect(plural(1, "lesson")).toBe("1 lesson");
    expect(plural(5, "lesson")).toBe("5 lessons");
  });
  it("drops titles", () => {
    expect(firstName("Prof. Meera Rao")).toBe("Meera");
    expect(firstName("Aanya Sharma")).toBe("Aanya");
  });
});

describe("formatClock", () => {
  it("formats video times", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75.9)).toBe("1:15");
    expect(formatClock(1200)).toBe("20:00");
    expect(formatClock(3723)).toBe("1:02:03");
  });
});
