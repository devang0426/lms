import { describe, expect, it } from "vitest";
import { expiredJobs, exportExpired, needsErase, notificationExpired, retentionCutoff, type JobFacts } from "./rules";

const now = new Date("2026-12-31T00:00:00Z");
const cutoff = retentionCutoff(now);
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("retentionCutoff", () => {
  it("is 90 days before now by default", () => {
    expect(cutoff.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(retentionCutoff(now, 7).toISOString()).toBe("2026-12-24T00:00:00.000Z");
  });
});

describe("notificationExpired", () => {
  it("deletes read notices older than the cutoff", () => {
    expect(notificationExpired({ readAt: daysAgo(95), createdAt: daysAgo(100) }, cutoff)).toBe(true);
  });

  it("keeps unread notices, however old", () => {
    expect(notificationExpired({ readAt: null, createdAt: daysAgo(400) }, cutoff)).toBe(false);
  });

  it("keeps read notices newer than the cutoff", () => {
    expect(notificationExpired({ readAt: daysAgo(1), createdAt: daysAgo(89) }, cutoff)).toBe(false);
    // Exactly at the cutoff stays: only older goes.
    expect(notificationExpired({ readAt: daysAgo(1), createdAt: cutoff }, cutoff)).toBe(false);
  });
});

describe("expiredJobs", () => {
  let n = 0;
  const job = (fields: Partial<JobFacts>): JobFacts => ({
    id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
    kind: "ingest-document",
    entityType: "document",
    entityId: "doc-1",
    status: "completed",
    createdAt: daysAgo(200),
    updatedAt: daysAgo(200),
    ...fields,
  });

  it("deletes old finished runs behind a newer run of the same kind", () => {
    const old = [job({ status: "completed" }), job({ status: "failed" }), job({ status: "canceled" })];
    const latest = job({ createdAt: daysAgo(10), updatedAt: daysAgo(10) });
    expect(expiredJobs([...old, latest], cutoff)).toEqual(old);
  });

  it("keeps each entity's newest run of each kind, however old (pages read it for their state)", () => {
    const failedNote = job({ status: "failed", entityId: "note-doc" });
    const chapters = job({ kind: "generate-chapters", entityType: "lesson", entityId: "lesson-1" });
    const notes = job({ kind: "generate-notes", entityType: "lesson", entityId: "lesson-1" });
    expect(expiredJobs([failedNote, chapters, notes], cutoff)).toEqual([]);
  });

  it("keeps unfinished runs and runs that finished inside the window", () => {
    const queued = job({ status: "queued" });
    const running = job({ status: "running" });
    const recent = job({ status: "completed", createdAt: daysAgo(120), updatedAt: daysAgo(30) });
    const newest = job({ createdAt: daysAgo(5), updatedAt: daysAgo(5) });
    expect(expiredJobs([queued, running, recent, newest], cutoff)).toEqual([]);
  });

  it("breaks a createdAt tie by id, like the SQL", () => {
    const at = daysAgo(150);
    const a = job({ createdAt: at, updatedAt: at, id: "00000000-0000-0000-0000-00000000000a" });
    const b = job({ createdAt: at, updatedAt: at, id: "00000000-0000-0000-0000-00000000000b" });
    expect(expiredJobs([b, a], cutoff)).toEqual([a]);
  });
});

describe("exportExpired (feature 33)", () => {
  it("goes once its 7 days are up, not before", () => {
    const expiresAt = new Date("2026-12-30T12:00:00Z");
    expect(exportExpired({ expiresAt }, new Date("2026-12-30T11:59:59Z"))).toBe(false);
    expect(exportExpired({ expiresAt }, expiresAt)).toBe(true);
    expect(exportExpired({ expiresAt }, now)).toBe(true);
  });
});

describe("needsErase (feature 33)", () => {
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it("finishes a deleted account that still isn't erased an hour later", () => {
    expect(needsErase({ deletedAt: hoursAgo(2), erasedAt: null }, now)).toBe(true);
  });

  it("leaves a fresh delete to its own run", () => {
    expect(needsErase({ deletedAt: hoursAgo(0.5), erasedAt: null }, now)).toBe(false);
  });

  it("skips live and already-erased accounts", () => {
    expect(needsErase({ deletedAt: null, erasedAt: null }, now)).toBe(false);
    expect(needsErase({ deletedAt: hoursAgo(48), erasedAt: hoursAgo(47) }, now)).toBe(false);
  });
});
