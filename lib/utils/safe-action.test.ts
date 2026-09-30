import { readdirSync, readFileSync } from "node:fs";
import { notFound, redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "./action-result";
import { safeAction } from "./safe-action";

vi.mock("@/lib/auth", () => ({ currentClerkId: async () => "user_abc" }));

afterEach(() => vi.restoreAllMocks());

describe("safeAction", () => {
  it("passes results through, failures included", async () => {
    const good = safeAction("good", async (n: number) => {
      return ok({ doubled: n * 2 });
    });
    const refused = safeAction("refused", async () => {
      return fail("invalid", "Type a title first.");
    });
    expect(await good(4)).toEqual({ ok: true, data: { doubled: 8 } });
    expect(await refused()).toEqual({ ok: false, error: { code: "invalid", message: "Type a title first." } });
  });

  it("turns a throw into an internal failure with a ref, and logs one line with the same ref", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rateCard = safeAction("rateCard", async (_id: string) => {
      throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") });
    });

    const res = await rateCard("card-1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("internal");
    const ref = /\(ref ([0-9a-f]{6})\)$/.exec(res.error.message)?.[1];
    expect(ref).toBeDefined();
    expect(res.error.message).toBe(`Something went wrong. Try again. (ref ${ref})`);

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: "error",
      source: "action",
      route: "rateCard",
      ref,
      userId: "user_abc",
      error: { name: "TypeError", message: "fetch failed", cause: { message: "ECONNRESET" } },
    });
  });

  it("lets redirect() and notFound() through to Next", async () => {
    const goes = safeAction("goes", async () => {
      redirect("/somewhere");
    });
    const missing = safeAction("missing", async () => {
      notFound();
    });
    await expect(goes()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    await expect(missing()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });
});

/* Every server action goes through safeAction under its own name
   (code-standards.md). The dev-only /dev/jobs form actions redirect, so
   they're left as they are. */
describe("server action files", () => {
  const UNWRAPPED = new Set(["app/dev/jobs/actions.ts"]);
  const files = readdirSync("app", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `app/${f.replaceAll("\\", "/")}`)
    .filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.filter((f) => !UNWRAPPED.has(f)))("%s wraps every action in safeAction, under its export's name", (file) => {
    const source = readFileSync(file, "utf8");
    const exported = [...source.matchAll(/^export (?:async function|function|const|let) (\w+)/gm)].map((m) => m[1]);
    const wrapped = [...source.matchAll(/^export const (\w+) = safeAction\("(\w+)"/gm)].map((m) => [m[1], m[2]]);
    expect(wrapped.length).toBeGreaterThan(0);
    expect(wrapped.map(([name]) => name)).toEqual(exported);
    for (const [name, label] of wrapped) expect(label).toBe(name);
  });
});
