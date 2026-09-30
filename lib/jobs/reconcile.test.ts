import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/lib/db/schema";

const retrieve = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({ runs: { retrieve: (id: string) => retrieve(id) }, auth: {}, tasks: {} }));
const update = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    update: () => ({ set: (fields: object) => ({ where: () => ({ returning: async () => [update(fields)] }) }) }),
  },
}));

const { reconcileJob, RECONCILE_AFTER_MS } = await import("./index");

const NOW = Date.parse("2026-09-30T10:00:00Z");
const job = (status: Job["status"], quietMs: number): Job => ({
  id: "j1",
  kind: "video-process",
  entityType: "video",
  entityId: "v1",
  triggerRunId: "run_1",
  status,
  stage: null,
  progress: 0,
  message: null,
  error: null,
  createdBy: null,
  createdAt: new Date(NOW - quietMs - 60_000),
  updatedAt: new Date(NOW - quietMs),
});

describe("reconcileJob (feature 29: fewer Trigger.dev calls)", () => {
  beforeEach(() => {
    retrieve.mockReset();
    update.mockReset();
    update.mockImplementation((fields: object) => ({ ...job("running", 0), ...fields }));
  });

  it("leaves a job the worker touched recently to Realtime", async () => {
    const recent = job("running", RECONCILE_AFTER_MS - 1000);
    expect(await reconcileJob(recent, NOW)).toBe(recent);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("never asks about a finished job", async () => {
    const done = job("completed", 60 * 60 * 1000);
    expect(await reconcileJob(done, NOW)).toBe(done);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("asks Trigger.dev about a job that has gone quiet, and records a run that ended", async () => {
    retrieve.mockResolvedValue({ status: "CRASHED" });
    const quiet = job("running", RECONCILE_AFTER_MS + 1000);
    const result = await reconcileJob(quiet, NOW);
    expect(retrieve).toHaveBeenCalledWith("run_1");
    expect(result.status).toBe("failed");
  });

  it("keeps a quiet job whose run is still going", async () => {
    retrieve.mockResolvedValue({ status: "EXECUTING" });
    const quiet = job("queued", RECONCILE_AFTER_MS + 1000);
    expect(await reconcileJob(quiet, NOW)).toBe(quiet);
    expect(update).not.toHaveBeenCalled();
  });
});
