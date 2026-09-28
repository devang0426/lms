import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiUsage } from "@/lib/db/schema";
import type { EngineUsage } from "./engine/types";

/* ai_usage logging (feature 09). Log only — no quotas in v1.

   The engine reports each successful provider call to recordUsage() (wired
   in getEngine()). withUsage() says who and what the calls are for, and
   writes the rows once the work finishes, whether it succeeded or not —
   a failed job still spent the money.

     const notes = await withUsage("lesson-notes", user.id, () => generateNotes(engine, …));
*/

interface UsageContext {
  feature: string;
  userId: string | null;
  events: EngineUsage[];
}

const context = new AsyncLocalStorage<UsageContext>();

export async function withUsage<T>(feature: string, userId: string | null, fn: () => Promise<T>): Promise<T> {
  const ctx: UsageContext = { feature, userId, events: [] };
  try {
    return await context.run(ctx, fn);
  } finally {
    await writeRows(ctx.feature, ctx.userId, ctx.events);
  }
}

/* The engine's onUsage hook. A call made outside withUsage() is still
   logged, as "untracked", so no spend goes missing. */
export function recordUsage(usage: EngineUsage): void {
  const ctx = context.getStore();
  if (ctx) {
    ctx.events.push(usage);
    return;
  }
  console.warn(`[ai_usage] ${usage.task} call to ${usage.model} outside withUsage(); logged as "untracked".`);
  void writeRows("untracked", null, [usage]);
}

async function writeRows(feature: string, userId: string | null, events: EngineUsage[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await db.insert(aiUsage).values(
      events.map((e) => ({
        feature,
        userId,
        task: e.task,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        costUsd: e.costUsd.toFixed(10),
        estimated: e.estimated,
      })),
    );
  } catch (err) {
    // Logging must never fail the feature that spent the tokens.
    console.error("[ai_usage] failed to write usage rows", err);
  }
}

/* Latest rows, for the /dev/jobs check page (admin only). */
export async function listRecentUsage(limit = 5) {
  return db.select().from(aiUsage).orderBy(desc(aiUsage.createdAt)).limit(limit);
}
