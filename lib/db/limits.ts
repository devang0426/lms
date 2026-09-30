import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { db } from "./client";

/* Per-person limits that can't be raced (feature 25, S3). Reading a count
   and inserting afterwards lets N requests sent at once all see "under the
   limit". So the write goes in one db.batch (one transaction) that starts
   with these two statements:

     1. lockFor(): a transaction-scoped advisory lock for the person, so
        their requests of this kind take turns here;
     2. underLimit(): counts, and aborts the whole batch unless the count
        is under the limit (enforce_limit(), migration 0018).

   Then the writes. The lock ends with the transaction. Each statement
   sees what an earlier holder committed, so the count is exact.

     try {
       await db.batch([lockFor("ai", userId), underLimit(count, 20, "questions"), insertTurn]);
     } catch (err) {
       if (isLimitError(err)) return refuse();
       throw err;
     }
*/

/* "ai": questions and new notes (the AI work a person starts); "post":
   discussion threads and replies; "export": data export requests
   (feature 33). */
export type LimitLock = "ai" | "post" | "export";

export function lockFor(kind: LimitLock, userId: string) {
  return db.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${userId}`}))`);
}

/* `count` is a scalar subquery: select count(*) … */
export function underLimit(count: SQL, max: number, what: string) {
  return db.execute(sql`select enforce_limit((${count}) < ${max}, ${what})`);
}

const LIMIT_SQLSTATE = "SH429";

/* True for the refusal underLimit() raises; drivers wrap it in `cause`. */
export function isLimitError(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (code === LIMIT_SQLSTATE || (typeof message === "string" && message.includes("limit reached:"))) return true;
  }
  return false;
}
