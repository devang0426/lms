import { describe, expect, it } from "vitest";
import { isLimitError } from "./limits";

/* Feature 25: the refusal raised by enforce_limit() (migration 0018),
   however the driver wraps it. */
describe("isLimitError", () => {
  it("recognises the limit's SQLSTATE, directly or as a cause", () => {
    const pg = Object.assign(new Error("limit reached: questions"), { code: "SH429" });
    expect(isLimitError(pg)).toBe(true);
    expect(isLimitError(new Error("Failed query: select enforce_limit(...)", { cause: pg }))).toBe(true);
    expect(isLimitError(new Error("outer", { cause: new Error("middle", { cause: pg }) }))).toBe(true);
  });

  it("recognises the message when the code is lost", () => {
    expect(isLimitError(new Error("limit reached: notes"))).toBe(true);
  });

  it("leaves every other error alone", () => {
    expect(isLimitError(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(false);
    expect(isLimitError(new Error("fetch failed"))).toBe(false);
    expect(isLimitError(null)).toBe(false);
    expect(isLimitError("limit")).toBe(false);
  });
});
