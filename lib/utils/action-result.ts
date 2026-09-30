/* The shape every server action returns (code-standards.md → API Routes
   and Server Actions). Shared by server actions and the client callers. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string } };

/* `internal`: something broke on the server (safeAction, feature 30). Its
   message carries a short reference that matches the log line. */
export type ActionErrorCode = "invalid" | "unauthorized" | "not_found" | "conflict" | "internal";

export function ok<T = null>(data: T = null as T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(code: ActionErrorCode, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } };
}

export const UNREACHABLE_MESSAGE = "Couldn't reach Studyhall. Check your connection and try again.";

/* For client callers: a server action's result, even when the request
   itself fails (offline, a new deploy, a timeout). The action can't throw
   (safeAction), but the call can, and a throw in a transition replaces
   the page with the error page, typed text and all (feature 30). */
export async function settle<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call;
  } catch {
    return fail("internal", UNREACHABLE_MESSAGE);
  }
}
