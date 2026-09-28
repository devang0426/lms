import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/* Neon over HTTP: no connection to manage, works on Vercel and Trigger.dev.
   It has no interactive transactions — use db.batch([...]) for atomic
   multi-statement writes. */

function createDb(url: string) {
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
