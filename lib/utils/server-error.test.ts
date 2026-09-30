import { describe, expect, it } from "vitest";
import { clerkIdFromHeaders, errorRef, firstReport, serverErrorLine } from "./server-error";

const jwt = (payload: object) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".");

describe("serverErrorLine", () => {
  it("writes one JSON line with where it happened and the error", () => {
    const err = new Error("Failed query", { cause: new TypeError("fetch failed") });
    const line = serverErrorLine(
      { source: "request", route: "/courses/[courseId]", path: "/courses/1", digest: "12345", userId: "user_1", error: err },
      new Date("2026-09-30T10:00:00Z"),
    );
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "error",
      at: "2026-09-30T10:00:00.000Z",
      source: "request",
      route: "/courses/[courseId]",
      path: "/courses/1",
      digest: "12345",
      userId: "user_1",
      error: { name: "Error", message: "Failed query", cause: { name: "TypeError", message: "fetch failed" } },
    });
    expect(typeof parsed.error.stack).toBe("string");
  });

  it("leaves out empty fields and copes with a thrown non-Error", () => {
    const parsed = JSON.parse(serverErrorLine({ source: "action", route: "saveGrade", userId: null, error: "boom" }));
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("digest");
    expect(parsed.error).toEqual({ name: "string", message: "boom" });
  });

  it("clips a very long message", () => {
    const parsed = JSON.parse(serverErrorLine({ source: "action", route: "x", error: new Error("a".repeat(5000)) }));
    expect(parsed.error.message.length).toBeLessThanOrEqual(2001);
  });
});

describe("firstReport", () => {
  it("lets a key through once within the window, then again after it", () => {
    const t = 1_000_000;
    expect(firstReport("123 / user_1", t)).toBe(true);
    expect(firstReport("123 / user_1", t + 1)).toBe(false);
    expect(firstReport("123 / user_1", t + 4_000)).toBe(false);
    expect(firstReport("123 /?_rsc=x user_1", t + 4_000)).toBe(true);
    expect(firstReport("123 / user_2", t + 4_000)).toBe(true);
    expect(firstReport("123 / user_1", t + 6_000)).toBe(true);
  });
});

describe("errorRef", () => {
  it("is six hex characters and varies", () => {
    const refs = new Set(Array.from({ length: 20 }, () => errorRef()));
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{6}$/);
    expect(refs.size).toBeGreaterThan(1);
  });
});

describe("clerkIdFromHeaders", () => {
  it("reads the session token's subject", () => {
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": jwt({ sub: "user_2abc", sid: "sess_1" }) })).toBe("user_2abc");
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": [jwt({ sub: "user_9" })] })).toBe("user_9");
  });

  it("is null without a usable token", () => {
    expect(clerkIdFromHeaders({})).toBeNull();
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": "" })).toBeNull();
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": "not-a-jwt" })).toBeNull();
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": "a.%%%.c" })).toBeNull();
    expect(clerkIdFromHeaders({ "x-clerk-auth-token": jwt({ sub: 42 }) })).toBeNull();
  });
});
