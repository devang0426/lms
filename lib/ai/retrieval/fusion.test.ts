import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, RRF_K } from "./fusion";

const ids = (xs: string[]) => xs.map((id) => ({ id }));

describe("reciprocalRankFusion", () => {
  it("ranks items found by both lists above items found by one", () => {
    const fused = reciprocalRankFusion([ids(["a", "b", "c"]), ids(["c", "d"])]);
    // b and d are both 2nd in their list: a tie, broken by id.
    expect(fused.map((f) => f.item.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("scores Σ 1 / (K + rank)", () => {
    const [top] = reciprocalRankFusion([ids(["x"]), ids(["y", "x"])]);
    expect(top.item.id).toBe("x");
    expect(top.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2));
  });

  it("keeps the first copy of an item and handles empty lists", () => {
    const fused = reciprocalRankFusion([[{ id: "a", from: "vector" }], [], [{ id: "a", from: "text" }]]);
    expect(fused).toHaveLength(1);
    expect(fused[0].item.from).toBe("vector");
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("breaks ties by the best rank in any list", () => {
    // b is 1st in list 2, a is 1st in list 1: equal scores, stable order by id.
    expect(reciprocalRankFusion([ids(["a"]), ids(["b"])]).map((f) => f.item.id)).toEqual(["a", "b"]);
  });
});
