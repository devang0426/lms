/* Structured AI output is untrusted (code-standards.md → AI and Jobs):
   validate it, retry once on a bad answer, then fail with a message the
   instructor can act on. Provider errors the user should see as they are
   (bad key, quota) are not retried here — the engine already backs off. */

import "server-only";

import { EngineError } from "../engine/types";

/* A generation failure worth showing to the instructor verbatim. */
export class GenerationError extends Error {
  override name = "GenerationError";
}

const FINAL: readonly EngineError["kind"][] = ["auth", "quota", "unsupported"];

export async function withOneRetry<T>(what: string, attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof EngineError && FINAL.includes(err.kind)) throw err;
      last = err;
    }
  }
  console.warn(`[generation] ${what} failed twice`, last);
  throw new GenerationError(`The AI couldn't draft the ${what} for this lecture. Try regenerating them.`);
}
