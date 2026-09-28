import { describe, expect, it } from "vitest";
import { formatInterval, nextIntervals, rateCurrent, type StudyCard } from "./cards";
import { newCardState } from "./fsrs";

const NOW = Date.UTC(2026, 8, 28, 12);
const DAY = 86_400_000;

function card(id: string, extra: Partial<StudyCard> = {}): StudyCard {
  return {
    id,
    courseId: "c",
    courseCode: "MATH 201",
    lessonId: "l",
    lessonTitle: "Span",
    front: `Q ${id}`,
    back: `A ${id}`,
    topic: "",
    startSec: 26,
    ...newCardState(NOW),
    lastReview: null,
    ...extra,
  };
}

describe("next intervals", () => {
  it("previews each rating of a new card with fsrs.ts", () => {
    const i = nextIntervals(card("a"), NOW);
    expect(formatInterval(i.again)).toBe("10m");
    expect(formatInterval(i.hard)).toBe("1d");
    expect(formatInterval(i.good)).toBe("2d");
    expect(i.easy).toBeGreaterThanOrEqual(2 * DAY); // "Easy" pushes it out by days
    expect(formatInterval(i.easy)).toBe("3d");
  });

  it("grows with a card's stability", () => {
    const learned = card("a", { state: "review", stability: 10, reps: 3, due: NOW });
    expect(nextIntervals(learned, NOW).good).toBeCloseTo(20 * DAY, -3);
  });

  it("formats minutes to years", () => {
    expect(formatInterval(30_000)).toBe("1m");
    expect(formatInterval(5 * 3_600_000)).toBe("5h");
    expect(formatInterval(45 * DAY)).toBe("2mo");
    expect(formatInterval(400 * DAY)).toBe("1y");
  });
});

describe("a review session", () => {
  it("brings an 'again' card back later in the same session", () => {
    let queue = [card("a"), card("b"), card("c")];
    const step = rateCurrent(queue, "again", NOW);
    queue = step.queue;
    expect(queue.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(step.rated).toMatchObject({ id: "a", state: "learning", lapses: 1 });
    expect(step.rated.due - NOW).toBe(10 * 60_000);
  });

  it("removes a card rated hard, good or easy; easy is days away", () => {
    const step = rateCurrent([card("a"), card("b")], "easy", NOW);
    expect(step.queue.map((c) => c.id)).toEqual(["b"]);
    expect(step.rated.state).toBe("review");
    expect((step.rated.due - NOW) / DAY).toBeCloseTo(2.8);
  });

  it("finishes when the last card is passed", () => {
    expect(rateCurrent([card("a")], "good", NOW).queue).toEqual([]);
    expect(() => rateCurrent([], "good", NOW)).toThrow();
  });
});
