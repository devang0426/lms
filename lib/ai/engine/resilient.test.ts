import { describe, expect, it, vi } from "vitest";
import { resilient } from "./resilient";
import { EngineError } from "./types";
import type { Engine } from "./types";

function base(overrides: Partial<Engine>): Engine {
  return {
    mode: "cloud",
    capabilities: () => ({ chat: true, transcription: false, tts: false, embeddings: false }),
    complete: async () => "x",
    structured: async () => ({}) as never,
    transcribe: async () => ({ text: "", segments: [] }),
    tts: async () => new Blob(),
    embed: async () => [],
    validate: async () => {},
    ...overrides,
  };
}

describe("resilient engine", () => {
  it("retries rate_limit errors then succeeds", async () => {
    vi.useFakeTimers();
    let n = 0;
    const eng = resilient(
      base({
        complete: async () => {
          n++;
          if (n < 3) throw new EngineError("429", "rate_limit");
          return "ok";
        },
      }),
    );
    const p = eng.complete({ messages: [] });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(n).toBe(3);
    vi.useRealTimers();
  });

  it("does not retry non-retryable (auth) errors", async () => {
    let n = 0;
    const eng = resilient(
      base({
        complete: async () => {
          n++;
          throw new EngineError("bad key", "auth");
        },
      }),
    );
    await expect(eng.complete({ messages: [] })).rejects.toThrow("bad key");
    expect(n).toBe(1);
  });

  it("gives up after the retry budget and rethrows", async () => {
    vi.useFakeTimers();
    let n = 0;
    const eng = resilient(
      base({
        structured: async () => {
          n++;
          throw new EngineError("still limited", "rate_limit");
        },
      }),
    );
    const p = eng
      .structured({ messages: [], schema: {}, schemaName: "x" })
      .then(() => null, (e: unknown) => e as EngineError);
    await vi.runAllTimersAsync();
    const err = await p;
    expect((err as EngineError).message).toBe("still limited");
    expect(n).toBe(5); // initial try + 4 backoffs
    vi.useRealTimers();
  });

  it("stops retrying once the caller's time limit has fired (feature 30)", async () => {
    vi.useFakeTimers();
    const deadline = new AbortController();
    const reason = new DOMException("That took too long.", "TimeoutError");
    let n = 0;
    const eng = resilient(
      base({
        complete: async () => {
          n++;
          throw new EngineError("429", "rate_limit");
        },
      }),
    );
    const p = eng.complete({ messages: [], signal: deadline.signal }).then(() => null, (e: unknown) => e);
    // The first retry is waiting when the limit fires.
    await vi.advanceTimersByTimeAsync(1000);
    deadline.abort(reason);
    await vi.runAllTimersAsync();
    expect(await p).toBe(reason);
    expect(n).toBe(1);
    vi.useRealTimers();
  });
});
