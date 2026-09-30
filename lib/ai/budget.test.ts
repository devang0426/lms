import { describe, expect, it, vi } from "vitest";
import {
  aiLimitsFor,
  atLimit,
  checkBudget,
  DEFAULT_AI_LIMITS,
  formatResetTime,
  limitClearsAt,
  limitMessage,
  nearLimit,
  type BudgetDeps,
} from "./budget";

/* Feature 25: the daily AI limit per person. */

const HOUR = 60 * 60 * 1000;
const t0 = new Date("2026-09-30T08:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);

describe("aiLimitsFor", () => {
  it("uses the suggested limits by default: students, and staff for instructors and admins", () => {
    expect(aiLimitsFor("student", {})).toEqual({ calls: 150, usd: 0.25 });
    expect(aiLimitsFor("instructor", {})).toEqual({ calls: 1000, usd: 3 });
    expect(aiLimitsFor("admin", {})).toEqual(DEFAULT_AI_LIMITS.staff);
  });

  it("reads each limit from the environment, per role", () => {
    const env = { AI_DAILY_CALLS_STUDENT: "5", AI_DAILY_USD_STUDENT: "0.01", AI_DAILY_CALLS_STAFF: "50", AI_DAILY_USD_STAFF: "0.5" };
    expect(aiLimitsFor("student", env)).toEqual({ calls: 5, usd: 0.01 });
    expect(aiLimitsFor("instructor", env)).toEqual({ calls: 50, usd: 0.5 });
  });

  it("falls back to the default for a blank, zero or malformed value", () => {
    expect(aiLimitsFor("student", { AI_DAILY_CALLS_STUDENT: "", AI_DAILY_USD_STUDENT: "abc" })).toEqual(DEFAULT_AI_LIMITS.student);
    expect(aiLimitsFor("student", { AI_DAILY_CALLS_STUDENT: "0", AI_DAILY_USD_STUDENT: "-1" })).toEqual(DEFAULT_AI_LIMITS.student);
  });
});

describe("atLimit and nearLimit", () => {
  const limits = { calls: 10, usd: 1 };

  it("counts calls as well as cost: free models log $0", () => {
    expect(atLimit({ calls: 9, usd: 0 }, limits)).toBe(false);
    expect(atLimit({ calls: 10, usd: 0 }, limits)).toBe(true);
    expect(atLimit({ calls: 1, usd: 1 }, limits)).toBe(true);
  });

  it("flags people at 80% of either limit", () => {
    expect(nearLimit({ calls: 7, usd: 0.5 }, limits)).toBe(false);
    expect(nearLimit({ calls: 8, usd: 0 }, limits)).toBe(true);
    expect(nearLimit({ calls: 0, usd: 0.8 }, limits)).toBe(true);
  });
});

describe("limitClearsAt", () => {
  const limits = { calls: 3, usd: 1 };

  it("is null while the person is under both limits", () => {
    expect(limitClearsAt([], limits)).toBeNull();
    expect(limitClearsAt([{ at: at(0), usd: 0 }], limits)).toBeNull();
  });

  it("over the call limit: when enough of the oldest calls are 24 hours old", () => {
    const rows = [0, 1, 2, 3].map((h) => ({ at: at(h), usd: 0 }));
    // Four calls, limit three: the first two must expire to be under it.
    expect(limitClearsAt(rows, limits)).toEqual(at(1 + 24));
    expect(limitClearsAt(rows.slice(0, 3), limits)).toEqual(at(0 + 24));
  });

  it("over the cost limit: when the spend left is under it", () => {
    const rows = [
      { at: at(0), usd: 0.1 },
      { at: at(1), usd: 0.9 },
      { at: at(2), usd: 0.05 },
    ];
    // $1.05 spent; dropping $0.10 leaves $0.95, under $1.
    expect(limitClearsAt(rows, limits)).toEqual(at(24));
    // $1.00 left is still at the limit, so the $1.00 call must go too.
    const exact = [
      { at: at(0), usd: 0.02 },
      { at: at(1), usd: 0.03 },
      { at: at(2), usd: 1 },
    ];
    expect(limitClearsAt(exact, limits)).toEqual(at(26));
  });

  it("waits for both limits", () => {
    const rows = [
      { at: at(0), usd: 0 },
      { at: at(1), usd: 0 },
      { at: at(2), usd: 1.2 },
    ];
    // Calls clear after the first expires, the cost only after the third.
    expect(limitClearsAt(rows, limits)).toEqual(at(26));
  });
});

describe("the refusal message", () => {
  const resetsAt = new Date("2026-09-30T09:36:20Z");

  it("shows the reader's own clock, rounded up to the minute", () => {
    expect(formatResetTime(resetsAt, "Asia/Kolkata")).toBe("15:07");
    expect(formatResetTime(new Date("2026-09-30T09:36:00Z"), "Asia/Kolkata")).toBe("15:06");
  });

  it("labels UTC when the browser hasn't said its zone", () => {
    expect(formatResetTime(resetsAt, null)).toBe("09:37 UTC");
  });

  it("reads as the spec asks", () => {
    expect(limitMessage(resetsAt, "Asia/Kolkata")).toBe("You've reached today's AI limit. It resets at 15:07.");
    expect(limitMessage(null, null)).toBe("You've reached today's AI limit. Try again tomorrow.");
  });
});

describe("checkBudget", () => {
  const student = { id: "11111111-1111-4111-8111-111111111111", role: "student" as const };
  const attempt = { feature: "assistant", entityType: "course", entityId: "22222222-2222-4222-8222-222222222222" };

  function deps(calls: { at: Date; usd: number }[], env: Record<string, string> = { AI_DAILY_CALLS_STUDENT: "2" }): BudgetDeps {
    return {
      usageToday: vi.fn(async () => ({ calls: calls.length, usd: calls.reduce((s, c) => s + c.usd, 0) })),
      windowCalls: vi.fn(async () => calls),
      logRefusal: vi.fn(async () => {}),
      timeZone: vi.fn(async () => "Asia/Kolkata"),
      env,
    };
  }

  it("lets the work start under the limit, with nothing logged", async () => {
    const d = deps([{ at: at(0), usd: 0 }]);
    expect(await checkBudget(student, attempt, d)).toEqual({ ok: true });
    expect(d.windowCalls).not.toHaveBeenCalled();
    expect(d.logRefusal).not.toHaveBeenCalled();
  });

  it("refuses at the limit with the reset time, and logs ai.limit_reached with ids only", async () => {
    const d = deps([
      { at: new Date("2026-09-30T02:00:00Z"), usd: 0 },
      { at: new Date("2026-09-30T03:00:00Z"), usd: 0 },
    ]);
    const result = await checkBudget(student, attempt, d);
    // Two calls, limit two: under it once the first is a day old (07:30 IST).
    expect(result).toEqual({
      ok: false,
      message: "You've reached today's AI limit. It resets at 07:30.",
      resetsAt: new Date("2026-10-01T02:00:00Z"),
    });
    expect(d.logRefusal).toHaveBeenCalledWith(student.id, attempt);
  });

  it("uses the staff limit for an instructor", async () => {
    const d = deps([{ at: at(0), usd: 0 }, { at: at(1), usd: 0 }], { AI_DAILY_CALLS_STUDENT: "2", AI_DAILY_CALLS_STAFF: "3" });
    expect(await checkBudget({ id: student.id, role: "instructor" }, attempt, d)).toEqual({ ok: true });
  });
});
