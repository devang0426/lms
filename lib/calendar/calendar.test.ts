import { describe, expect, it } from "vitest";
import { dayKey, eventLink, eventTone, gridRange, groupByDay, monthGrid, monthParam, parseMonth, shiftMonth, type CalendarEvent } from "./index";

const ev = (id: string, iso: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  courseId: "c",
  courseCode: "MATH 201",
  kind: "due",
  title: id,
  at: Date.parse(iso),
  href: null,
  external: false,
  done: false,
  ...over,
});

describe("months", () => {
  it("parses ?month= and refuses anything else", () => {
    expect(parseMonth("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-1")).toBeNull();
    expect(parseMonth(["2026-10"])).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it("steps across year ends", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthParam({ year: 2027, month: 3 })).toBe("2027-03");
  });
});

describe("monthGrid", () => {
  it("lays out whole weeks from Monday", () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ key: "2026-09-28", day: 28, inMonth: false });
    expect(weeks[0][3]).toEqual({ key: "2026-10-01", day: 1, inMonth: true });
    expect(weeks[4][6]).toEqual({ key: "2026-11-01", day: 1, inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("loads the grid with a day of slack each side", () => {
    const { from, to } = gridRange({ year: 2026, month: 10 });
    expect(from.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });
});

describe("days", () => {
  it("groups by UTC day in time order", () => {
    const days = groupByDay([ev("b", "2026-10-06T23:59:00Z"), ev("a", "2026-10-06T08:00:00Z"), ev("c", "2026-10-07T00:30:00Z")], true);
    expect([...days.keys()]).toEqual(["2026-10-06", "2026-10-07"]);
    expect(days.get("2026-10-06")!.map((e) => e.id)).toEqual(["a", "b"]);
    expect(dayKey(Date.parse("2026-10-06T23:59:00Z"), true)).toBe("2026-10-06");
  });
});

describe("eventTone", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it("is Butter only for an open deadline within three days", () => {
    expect(eventTone(ev("x", "2026-10-03T12:00:00Z"), now)).toBe("butter");
    expect(eventTone(ev("x", "2026-10-03T12:00:00Z", { kind: "quiz" }), now)).toBe("butter");
    expect(eventTone(ev("x", "2026-10-03T12:00:00Z", { done: true }), now)).toBe("oat");
    expect(eventTone(ev("x", "2026-10-03T12:00:00Z", { kind: "live" }), now)).toBe("oat");
    expect(eventTone(ev("x", "2026-10-06T12:00:00Z"), now)).toBe("oat");
    expect(eventTone(ev("x", "2026-09-30T12:00:00Z"), now)).toBe("oat");
  });
});

describe("eventLink", () => {
  it("keeps in-app paths and http(s) links, nothing else", () => {
    expect(eventLink("/courses/1/lessons/2")).toEqual({ href: "/courses/1/lessons/2", external: false });
    expect(eventLink("https://zoom.us/j/123")).toEqual({ href: "https://zoom.us/j/123", external: true });
    expect(eventLink("//evil.example/x")).toBeNull();
    expect(eventLink("/\\evil.example")).toBeNull();
    expect(eventLink("javascript:alert(1)")).toBeNull();
    expect(eventLink(null)).toBeNull();
  });
});
