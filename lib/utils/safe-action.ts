import "server-only";

import { unstable_rethrow } from "next/navigation";
import { currentClerkId } from "@/lib/auth";
import { fail, type ActionResult } from "./action-result";
import { errorRef, logServerError } from "./server-error";

/* Every server action is wrapped in this (feature 30, R2):

     export const saveGrade = safeAction("saveGrade", async (raw: …): Promise<ActionResult<…>> => {
       …
     });

   An action that throws (the database answers "fetch failed", a bug)
   would reach the error page, which replaces the page: the typed text is
   gone and a flashcard session starts over. Instead the error is logged
   once with a short reference (lib/utils/server-error.ts) and the caller
   gets a failure to show in place, with the same reference so the log
   line can be found. redirect() and notFound() still work:
   unstable_rethrow passes Next's own control-flow errors on.

   `name` is the log line's `route`. It's spelled out because production
   builds minify function names away; a test (safe-action.test.ts) checks
   it matches the export in every "use server" file. */

export const INTERNAL_MESSAGE = "Something went wrong. Try again.";

export function safeAction<A extends unknown[], T>(
  name: string,
  action: (...args: A) => Promise<ActionResult<T>>,
): (...args: A) => Promise<ActionResult<T>> {
  return async (...args: A) => {
    try {
      return await action(...args);
    } catch (err) {
      unstable_rethrow(err);
      const ref = errorRef();
      logServerError({ source: "action", route: name, ref, userId: await currentClerkId(), error: err });
      return fail("internal", `${INTERNAL_MESSAGE} (ref ${ref})`);
    }
  };
}
