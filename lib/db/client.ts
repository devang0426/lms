import "server-only";

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { loggingFetch, queryLogEnabled } from "./query-log";
import * as schema from "./schema";

/* Neon over HTTP: no connection to manage, works on Vercel and Trigger.dev.
   It has no interactive transactions — use db.batch([...]) for atomic
   multi-statement writes.

   Every query is its own HTTPS round trip (~300 ms from India to
   us-east-2), so a page reads through one db.batch after its access check
   rather than a chain of awaits (feature 29). DB_LOG=1 logs each request
   (lib/db/query-log.ts) to count them. */

function createDb(url: string) {
  if (queryLogEnabled()) neonConfig.fetchFunction = loggingFetch(fetch);
  return drizzle(neon(url), { schema, casing: "snake_case" });
}
type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function getDb(): Db {
  if (instance) return instance;
  const url = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_POOLED (or DATABASE_URL) is not set.");
  instance = createDb(url);
  return instance;
}

/* Created on first use, not at import: Trigger.dev's deploy step imports
   every task file to index it, before any env vars exist. */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

/* The rows a tuple of query builders resolves to: what a function that
   shapes part of a page's db.batch takes (feature 29). */
export type BatchRows<T> = { readonly [K in keyof T]: Awaited<T[K]> };

/* For a read the page can show without at first (the sidebar's due-cards
   notice): wait a moment so the page's own batch goes out first. A
   request reuses a warm keep-alive connection (~310 ms from India), but
   one sent at the same moment as another opens a new TLS connection
   (~1.4 s), and the page's batch shouldn't be the one to pay it
   (feature 29). */
export function afterPageReads(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
