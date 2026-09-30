import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantEvent, TurnView } from "@/lib/chat/types";
import { answerStream, TOO_LONG_MESSAGE } from "./assistant";
import { EngineError } from "./engine";

/* answerStream's NDJSON and its time limit (feature 30). */

const turn: TurnView = { id: "t1", role: "assistant", content: "Eigenvalues [S1]", citations: [], refused: false };
const where = { route: "/api/assistant", userId: "user_1" };

async function events(res: Response): Promise<AssistantEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AssistantEvent);
}

afterEach(() => vi.restoreAllMocks());

describe("answerStream", () => {
  it("streams the thread, the deltas and the checked turn", async () => {
    const res = answerStream(
      "thread-1",
      async (on) => {
        on.delta("Eigen");
        on.delta("values");
        return turn;
      },
      where,
    );
    expect(await events(res)).toEqual([
      { type: "thread", threadId: "thread-1" },
      { type: "delta", text: "Eigen" },
      { type: "delta", text: "values" },
      { type: "done", turn },
    ]);
  });

  it("ends with 'That took too long' at the time limit, stops the work and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let late: (() => void) | undefined;
    const res = answerStream(
      "thread-2",
      (on) => {
        signal = on.signal;
        on.delta("Part of an answer");
        late = () => on.delta("too late");
        return new Promise<TurnView>(() => {}); // a model that never finishes
      },
      { ...where, limitMs: 20 },
    );
    const got = await events(res);
    expect(got).toEqual([
      { type: "thread", threadId: "thread-2" },
      { type: "delta", text: "Part of an answer" },
      { type: "error", message: TOO_LONG_MESSAGE },
    ]);
    expect(TOO_LONG_MESSAGE).toBe("That took too long. Try again.");
    expect(signal?.aborted).toBe(true);
    // Text that arrives after the stream closed is dropped, not an error.
    expect(() => late?.()).not.toThrow();

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ source: "stream", route: "/api/assistant", userId: "user_1", error: { name: "TimeoutError" } });
  });

  it("says the assistant is busy on a rate limit, and something went wrong otherwise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const busy = answerStream("t", async () => Promise.reject(new EngineError("429", "rate_limit")), where);
    const broken = answerStream("t", async () => Promise.reject(new Error("fetch failed")), where);
    expect((await events(busy)).at(-1)).toEqual({ type: "error", message: "The assistant is busy right now. Try again in a minute." });
    expect((await events(broken)).at(-1)).toEqual({
      type: "error",
      message: "The assistant couldn't answer just now. Try again in a moment.",
    });
  });
});
