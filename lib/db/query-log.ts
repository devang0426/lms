import "server-only";

import { cache } from "react";

/* The query counter (feature 29). With DB_LOG=1, every HTTP request to
   Neon (one query, or one db.batch) is logged with its time and statement
   count, so a page's round trips can be counted before and after a change:

     [db] page 12 · rt 1 · 1 stmt · 304 ms · 1 KB · +0 ms · select "id", "clerk_id"…
     [db] page 12 · rt 2 · batch of 14 · 331 ms · 38 KB · +309 ms · select "courses"…

   "rt" numbers the round trips: a request that starts while another of
   the same group is still out shares its number (they overlap). Requests
   made while rendering one page share a group (React's cache() is per
   request). Route handlers, actions and scripts have no render, so their
   requests are grouped by time: a gap of over 2 s starts a new group.

   For measuring only (local dev or a local production build). It reads
   request bodies, so leave it unset on deployments. */

interface Group {
  label: string;
  start: number;
  inFlight: number;
  rt: number;
}

let groups = 0;
const token = cache(() => ({}));
const renderGroup = cache((): Group => ({ label: `page ${++groups}`, start: performance.now(), inFlight: 0, rt: 0 }));

let burst: (Group & { last: number }) | null = null;
const BURST_GAP_MS = 2000;

/* Inside a server-component render, cache() returns the same object for
   the whole request; elsewhere it calls through every time. */
function groupFor(now: number): Group {
  if (token() === token()) return renderGroup();
  if (!burst || (burst.inFlight === 0 && now - burst.last > BURST_GAP_MS)) {
    burst = { label: `burst ${++groups}`, start: now, inFlight: 0, rt: 0, last: now };
  }
  burst.last = now;
  return burst;
}

/* What the request carries: { query } or { queries: [...] } (a batch). */
export function describeBody(body: unknown): { statements: number; preview: string } {
  let parsed: unknown = null;
  try {
    parsed = typeof body === "string" ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  const queries = (parsed as { queries?: { query?: unknown }[] } | null)?.queries;
  const first = Array.isArray(queries) ? queries[0]?.query : (parsed as { query?: unknown } | null)?.query;
  const preview = typeof first === "string" ? first.replace(/\s+/g, " ").trim().slice(0, 70) : "";
  return { statements: Array.isArray(queries) ? queries.length : 1, preview };
}

export function formatLine(g: Pick<Group, "label" | "rt">, statements: number, ms: number, offset: number, preview: string, bytes?: number): string {
  const what = statements === 1 ? "1 stmt" : `batch of ${statements}`;
  const size = bytes === undefined ? "" : ` · ${bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`}`;
  return `[db] ${g.label} · rt ${g.rt} · ${what} · ${Math.round(ms)} ms${size} · +${Math.round(offset)} ms · ${preview}${preview.length >= 70 ? "…" : ""}`;
}

/* Neon's fetchFunction, wrapped. The time runs until the whole response
   body is in (a big result takes a while to download), so the body is
   read here and handed on as a fresh Response. */
export function loggingFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const group = groupFor(started);
    if (group.inFlight === 0) group.rt += 1;
    group.inFlight += 1;
    const rt = group.rt;
    const { statements, preview } = describeBody(init?.body);
    let bytes: number | undefined;
    try {
      const res = await base(input, init);
      const body = await res.arrayBuffer();
      bytes = body.byteLength;
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    } finally {
      group.inFlight -= 1;
      console.log(formatLine({ label: group.label, rt }, statements, performance.now() - started, started - group.start, preview, bytes));
    }
  };
}

export const queryLogEnabled = (env: Record<string, string | undefined> = process.env) => env.DB_LOG === "1";
