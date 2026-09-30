import { describe, expect, it, vi } from "vitest";
import { describeBody, formatLine, loggingFetch, queryLogEnabled } from "./query-log";

describe("the query counter (DB_LOG=1)", () => {
  it("is on only for DB_LOG=1", () => {
    expect(queryLogEnabled({ DB_LOG: "1" })).toBe(true);
    expect(queryLogEnabled({ DB_LOG: "0" })).toBe(false);
    expect(queryLogEnabled({})).toBe(false);
  });

  it("reads a single query and a batch from Neon's request body", () => {
    expect(describeBody(JSON.stringify({ query: 'select  "id"\n from "users" where "clerk_id" = $1', params: ["x"] }))).toEqual({
      statements: 1,
      preview: 'select "id" from "users" where "clerk_id" = $1',
    });
    const batch = describeBody(JSON.stringify({ queries: [{ query: "select 1" }, { query: "select 2" }, { query: "select 3" }] }));
    expect(batch).toEqual({ statements: 3, preview: "select 1" });
    expect(describeBody("not json")).toEqual({ statements: 1, preview: "" });
    expect(describeBody(undefined)).toEqual({ statements: 1, preview: "" });
  });

  it("formats one line per request", () => {
    expect(formatLine({ label: "page 3", rt: 2 }, 14, 331.4, 309.6, "select 1")).toBe("[db] page 3 · rt 2 · batch of 14 · 331 ms · +310 ms · select 1");
    expect(formatLine({ label: "burst 4", rt: 1 }, 1, 12, 0, "x".repeat(70))).toMatch(/1 stmt · 12 ms · \+0 ms · x{70}…$/);
    expect(formatLine({ label: "page 5", rt: 3 }, 18, 700, 720, "select 1", 190_000)).toBe("[db] page 5 · rt 3 · batch of 18 · 700 ms · 186 KB · +720 ms · select 1");
  });

  it("numbers round trips: overlapping requests share one, a later one starts the next", async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    const resolvers: (() => void)[] = [];
    const base = vi.fn(() => new Promise<Response>((resolve) => resolvers.push(() => resolve(new Response("{}")))));
    const f = loggingFetch(base as unknown as typeof fetch);
    const body = (q: string) => ({ method: "POST", body: JSON.stringify({ query: q }) });

    const a = f("https://db.test/sql", body("select a"));
    const b = f("https://db.test/sql", body("select b"));
    resolvers.splice(0).forEach((r) => r());
    await Promise.all([a, b]);
    const c = f("https://db.test/sql", body("select c"));
    resolvers.splice(0).forEach((r) => r());
    await c;
    log.mockRestore();

    expect(base).toHaveBeenCalledTimes(3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/· rt 1 · .*select a$/);
    expect(lines[1]).toMatch(/· rt 1 · .*select b$/);
    expect(lines[2]).toMatch(/· rt 2 · .*select c$/);
  });
});
