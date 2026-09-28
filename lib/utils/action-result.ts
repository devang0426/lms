/* The shape every server action returns (code-standards.md → API Routes
   and Server Actions). Shared by server actions and the client callers. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string } };

export type ActionErrorCode = "invalid" | "unauthorized" | "not_found" | "conflict";

export function ok<T = null>(data: T = null as T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(code: ActionErrorCode, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } };
}
