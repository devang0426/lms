import { describe, expect, it, vi } from "vitest";

/* The insert resolves only when the test says so, to see who waits for it. */
let finishInsert: () => void = () => {};
const inserted = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (rows: unknown[]) =>
        new Promise<void>((resolve) => {
          inserted(rows);
          finishInsert = resolve;
        }),
    }),
  },
}));

const { backgroundUsageWrites, recordUsage, withUsage } = await import("./usage");

const call = { task: "embeddings" as const, model: "m", inputTokens: 3, outputTokens: 0, costUsd: 0.001, estimated: false };

describe("ai_usage writes", () => {
  it("withUsage waits for its rows by default (tasks and actions)", async () => {
    let done = false;
    const work = withUsage("retrieval", "u1", async () => {
      recordUsage(call);
      return "ok";
    }).then(() => (done = true));
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledTimes(1));
    expect(done).toBe(false);
    finishInsert();
    await work;
    expect(done).toBe(true);
  });

  it("inside backgroundUsageWrites().run the insert starts but nobody waits; settled() does (feature 29)", async () => {
    inserted.mockClear();
    const writes = backgroundUsageWrites();
    const result = await writes.run(() =>
      withUsage("assistant", "u1", async () => {
        recordUsage(call);
        return "answer";
      }),
    );
    expect(result).toBe("answer");
    expect(inserted).toHaveBeenCalledTimes(1);

    let settled = false;
    const pending = writes.settled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    finishInsert();
    await pending;
    expect(settled).toBe(true);
  });
});
