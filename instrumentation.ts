import type { Instrumentation } from "next";
import { clerkIdFromHeaders, firstReport, logServerError } from "./lib/utils/server-error";

/* Runs once when a Next.js server instance starts, before it handles a
   request (feature 24); not during `next build`. A missing or malformed
   environment variable stops the server here with one message naming
   every problem (lib/env.ts). The Node-only check sits behind the runtime
   test, which the Edge build compiles away. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { exitOnBadEnv } = await import("./lib/env");
    exitOnBadEnv();
  }
}

/* Every error Next catches while serving a request (a page or layout that
   throws, a route handler, the proxy) becomes one structured log line
   (feature 30): the route, the digest the error page shows as its Ref,
   the user and the error. Server actions catch their own through
   safeAction, which logs the same way. A Sentry capture can go in
   logServerError later. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const userId = clerkIdFromHeaders(request.headers);
  // One failure awaited by a page and its layouts is reported once per segment.
  if (digest && !firstReport(`${digest} ${request.path} ${userId}`)) return;
  logServerError({
    source: "request",
    route: `${context.routeType} ${context.routePath}`,
    path: request.path,
    digest,
    userId,
    error,
  });
};
