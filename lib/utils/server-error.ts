/* One place for server errors (feature 30, R1). A page, route or proxy
   error reaches it through instrumentation.ts → onRequestError; a server
   action's through safeAction (lib/utils/safe-action.ts), which catches it
   so the page stays. Each error is one JSON line on stderr, which Vercel's
   logs show and can search. A Sentry capture can go in logServerError
   later, with nothing else changing.

   Pure apart from console.error, so the Edge build of instrumentation.ts
   can import it too. */

export interface ServerErrorEntry {
  /* Where it was caught: a request (page, route handler, proxy), a server
     action wrapped in safeAction, or a streamed answer that had already
     started (lib/ai/assistant.ts, answerStream). */
  source: "request" | "action" | "stream";
  /* The route file (e.g. /courses/[courseId]) or the action's name. */
  route: string;
  /* A request's path, e.g. /courses/1f…?t=30. */
  path?: string;
  /* Next's hash for a server error: the "Ref" an error page shows. */
  digest?: string;
  /* The short reference an action's failure message shows. */
  ref?: string;
  /* The Clerk user id, when there is a session. */
  userId?: string | null;
  error: unknown;
}

const MAX_MESSAGE = 2000;
const MAX_STACK_LINES = 12;

/* Six hex characters, e.g. "ab12cd": short enough to read out, enough to
   find one line in a day of logs. */
export function errorRef(): string {
  const bytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function serverErrorLine(entry: ServerErrorEntry, now = new Date()): string {
  const { error, ...where } = entry;
  return JSON.stringify({
    level: "error",
    at: now.toISOString(),
    ...Object.fromEntries(Object.entries(where).filter(([, v]) => v !== undefined && v !== null)),
    error: describe(error),
  });
}

export function logServerError(entry: ServerErrorEntry): void {
  console.error(serverErrorLine(entry));
}

/* Next reports one failure once per segment that awaited it: a page and
   its two layouts all waiting on the same failed user lookup gave three
   identical lines. So a request error is logged the first time its key
   (digest, path, user) is seen within a few seconds; a retry has its own
   path (?_rsc=…), so it's logged again. */
const REPEAT_WINDOW_MS = 5_000;
const recentReports = new Map<string, number>();

export function firstReport(key: string, now = Date.now()): boolean {
  for (const [k, at] of recentReports) if (now - at > REPEAT_WINDOW_MS) recentReports.delete(k);
  if (recentReports.has(key)) return false;
  recentReports.set(key, now);
  return true;
}

interface ErrorDescription {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorDescription;
}

/* The error's name, message, the top of its stack and its cause (Neon's
   "fetch failed" keeps the socket error there). */
function describe(error: unknown, depth = 0): ErrorDescription {
  if (!(error instanceof Error)) return { name: typeof error, message: clip(String(error)) };
  const stack = error.stack?.split("\n").slice(1, MAX_STACK_LINES + 1).map((l) => l.trim()).join("\n");
  return {
    name: error.name,
    message: clip(error.message),
    ...(stack ? { stack } : {}),
    ...(error.cause !== undefined && depth < 2 ? { cause: describe(error.cause, depth + 1) } : {}),
  };
}

function clip(text: string): string {
  return text.length <= MAX_MESSAGE ? text : `${text.slice(0, MAX_MESSAGE)}…`;
}

/* The signed-in user's Clerk id from a request's headers, for the log
   line only (never for access). clerkMiddleware (proxy.ts) verifies the
   session and passes its token on as x-clerk-auth-token; the id is the
   token's `sub`. Null when there's no session or the token can't be read. */
export function clerkIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["x-clerk-auth-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub: unknown = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub.startsWith("user_") ? sub : null;
  } catch {
    return null;
  }
}
