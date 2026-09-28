import { describe, expect, it } from "vitest";
import { activeIndex, isWatchedEnough, mergeRanges, resumePosition, watchedFraction, type Range } from "./watch";

describe("mergeRanges", () => {
  it("sorts and merges overlapping and near-touching ranges", () => {
    expect(mergeRanges([[30, 40], [0, 10], [9, 20], [20.5, 25]])).toEqual([[0, 25], [30, 40]]);
  });

  it("clamps to the duration and drops invalid pairs", () => {
    const junk = [[5, 2], [Number.NaN, 4], [-3, 4], [90, 150]] as Range[];
    expect(mergeRanges(junk, 100)).toEqual([[0, 4], [90, 100]]);
  });

  it("does not mutate its input", () => {
    const input: Range[] = [[0, 5], [4, 8]];
    mergeRanges(input);
    expect(input).toEqual([[0, 5], [4, 8]]);
  });
});

describe("watched share", () => {
  it("counts overlapping viewing once", () => {
    expect(watchedFraction([[0, 50], [25, 60]], 100)).toBeCloseTo(0.6);
  });

  it("completes at 90%", () => {
    expect(isWatchedEnough([[0, 89]], 100)).toBe(false);
    expect(isWatchedEnough([[0, 45], [50, 95]], 100)).toBe(true);
  });

  it("never completes without a duration", () => {
    expect(isWatchedEnough([[0, 100]], 0)).toBe(false);
  });
});

describe("resumePosition", () => {
  it("prefers ?t=", () => {
    expect(resumePosition({ t: 768, positionSec: 100, durationSec: 1200 })).toBe(768);
    expect(resumePosition({ t: 0, positionSec: 100, durationSec: 1200 })).toBe(0);
  });

  it("clamps ?t= to the length", () => {
    expect(resumePosition({ t: 5000, positionSec: null, durationSec: 1200 })).toBe(1200);
  });

  it("resumes from the saved position", () => {
    expect(resumePosition({ t: null, positionSec: 300, durationSec: 1200 })).toBe(300);
  });

  it("starts over within 10 s of the end", () => {
    expect(resumePosition({ t: null, positionSec: 1191, durationSec: 1200 })).toBe(0);
    expect(resumePosition({ t: null, positionSec: 1189, durationSec: 1200 })).toBe(1189);
  });

  it("starts at 0 with nothing saved", () => {
    expect(resumePosition({ t: null, positionSec: undefined, durationSec: null })).toBe(0);
  });
});

describe("activeIndex", () => {
  const starts = [0, 4.2, 9, 15.5];
  it("finds the segment that has started", () => {
    expect(activeIndex(starts, 0)).toBe(0);
    expect(activeIndex(starts, 8.99)).toBe(1);
    expect(activeIndex(starts, 9)).toBe(2);
    expect(activeIndex(starts, 999)).toBe(3);
  });

  it("is -1 before the first or when empty", () => {
    expect(activeIndex([2, 5], 1)).toBe(-1);
    expect(activeIndex([], 3)).toBe(-1);
  });
});
