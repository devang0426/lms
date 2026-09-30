import "server-only";

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { aiUsage, type Role, type User } from "@/lib/db/schema";
import { readerTimeZone } from "@/lib/utils/reader-zone";

/* The daily AI limit per person (feature 25). A safety limit, not credits:
   one student, or a newly made account, can't run up the university's AI
   bill or use up the free models' shared quota (20 requests a minute and
   1,000 a day for the whole app key). So it counts calls as well as cost:
   free models log $0.

   The window is the last 24 hours of the person's ai_usage rows. It's
   checked before any AI work starts: an assistant or space-chat question,
   a new private note or a retry, a podcast, and a regenerate on the review
   screen. Background tasks charge whoever started them, so their calls
   count too. Work already running is never stopped. */

export interface AiLimits {
  calls: number;
  usd: number;
}

export interface AiUsageToday {
  calls: number;
  usd: number;
}

/* Suggested in the feature 25 spec; each can be set per deployment. */
export const DEFAULT_AI_LIMITS = {
  student: { calls: 150, usd: 0.25 },
  staff: { calls: 1000, usd: 3 },
} as const satisfies Record<string, AiLimits>;

const LIMIT_VARS = {
  student: { calls: "AI_DAILY_CALLS_STUDENT", usd: "AI_DAILY_USD_STUDENT" },
  staff: { calls: "AI_DAILY_CALLS_STAFF", usd: "AI_DAILY_USD_STAFF" },
} as const;

const WINDOW_MS = 24 * 60 * 60 * 1000;

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : fallback;
};

/* Instructors and admins share the staff limit. */
export function aiLimitsFor(role: Role, env: Record<string, string | undefined> = process.env): AiLimits {
  const group = role === "student" ? "student" : "staff";
  const vars = LIMIT_VARS[group];
  const fallback = DEFAULT_AI_LIMITS[group];
  return { calls: positive(env[vars.calls], fallback.calls), usd: positive(env[vars.usd], fallback.usd) };
}

export function atLimit(usage: AiUsageToday, limits: AiLimits): boolean {
  return usage.calls >= limits.calls || usage.usd >= limits.usd;
}

/* At 80% of either limit: the admin Users page flags them. */
export function nearLimit(usage: AiUsageToday, limits: AiLimits): boolean {
  return usage.calls >= limits.calls * 0.8 || usage.usd >= limits.usd * 0.8;
}

/* When the person is under both limits again. The window rolls, so that's
   when enough of their oldest calls are 24 hours old: the first call, in
   time order, after whose expiry both the calls and the cost left are
   under the limits. `rows` are the window's calls, oldest first. */
export function limitClearsAt(rows: { at: Date; usd: number }[], limits: AiLimits): Date | null {
  let calls = rows.length;
  let usd = rows.reduce((sum, r) => sum + r.usd, 0);
  if (calls < limits.calls && usd < limits.usd) return null;
  for (const row of rows) {
    calls -= 1;
    usd -= row.usd;
    // A little slack for float sums of 10-decimal costs.
    if (calls < limits.calls && usd < limits.usd - 1e-9) return new Date(row.at.getTime() + WINDOW_MS);
  }
  return null;
}

/* "15:07", rounded up to the minute so it's never early. In the reader's
   zone when the browser has told us (the tz cookie), else labelled UTC. */
export function formatResetTime(at: Date, timeZone: string | null): string {
  const up = new Date(Math.ceil(at.getTime() / 60_000) * 60_000);
  const time = up.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? "UTC" });
  return timeZone ? time : `${time} UTC`;
}

export function limitMessage(resetsAt: Date | null, timeZone: string | null): string {
  return resetsAt
    ? `You've reached today's AI limit. It resets at ${formatResetTime(resetsAt, timeZone)}.`
    : "You've reached today's AI limit. Try again tomorrow.";
}

/* ---- The database side ------------------------------------------------------ */

const inWindow = (userId: string) => and(eq(aiUsage.userId, userId), gt(aiUsage.createdAt, sql`now() - interval '24 hours'`));

/* Calls and cost over the last 24 hours; the statement can join a
   route's batch (feature 29). */
export function usageTodayQuery(userId: string) {
  return db
    .select({
      calls: sql<number>`count(*)`.mapWith(Number),
      usd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`.mapWith(Number),
    })
    .from(aiUsage)
    .where(inWindow(userId));
}

export function toUsageToday([row]: readonly { calls: number; usd: number }[]): AiUsageToday {
  return { calls: row?.calls ?? 0, usd: row?.usd ?? 0 };
}

export async function usageToday(userId: string): Promise<AiUsageToday> {
  return toUsageToday(await usageTodayQuery(userId));
}

/* The window's calls, oldest first: only read when someone is refused. */
async function windowCalls(userId: string): Promise<{ at: Date; usd: number }[]> {
  const rows = await db
    .select({ at: aiUsage.createdAt, usd: aiUsage.costUsd })
    .from(aiUsage)
    .where(inWindow(userId))
    .orderBy(asc(aiUsage.createdAt));
  return rows.map((r) => ({ at: r.at, usd: Number(r.usd) }));
}

/* What the person was about to start, for the audit row. Ids only: admins
   read the audit log, and a private note's title stays private. */
export interface AiAttempt {
  feature: string;
  entityType: string;
  entityId: string;
}

export type BudgetCheck = { ok: true } | { ok: false; message: string; resetsAt: Date | null };

export interface BudgetDeps {
  usageToday: (userId: string) => Promise<AiUsageToday>;
  windowCalls: (userId: string) => Promise<{ at: Date; usd: number }[]>;
  logRefusal: (userId: string, attempt: AiAttempt) => Promise<void>;
  timeZone: () => Promise<string | null>;
  env: Record<string, string | undefined>;
}

const serverDeps: BudgetDeps = {
  usageToday,
  windowCalls,
  logRefusal: async (userId, { feature, entityType, entityId }) => {
    await auditInsert({ actorId: userId, action: "ai.limit_reached", entityType, entityId, data: { feature } });
  },
  timeZone: readerTimeZone,
  get env() {
    return process.env;
  },
};

/* Before starting AI work for this person: ok, or the refusal to show
   ("…It resets at 15:07."), with an ai.limit_reached audit row written. */
export async function checkBudget(user: Pick<User, "id" | "role">, attempt: AiAttempt, deps: BudgetDeps = serverDeps): Promise<BudgetCheck> {
  const limits = aiLimitsFor(user.role, deps.env);
  if (!atLimit(await deps.usageToday(user.id), limits)) return { ok: true };
  const [rows, timeZone] = await Promise.all([deps.windowCalls(user.id), deps.timeZone(), deps.logRefusal(user.id, attempt)]);
  const resetsAt = limitClearsAt(rows, limits);
  return { ok: false, message: limitMessage(resetsAt, timeZone), resetsAt };
}

/* checkBudget with the day's usage already counted (usageToday): the
   assistant route counts it alongside its access check, in the same round
   trip, and decides only once the course is known to be visible, so a
   refusal's audit row never names a course the person can't see
   (feature 29). */
export function checkCountedBudget(user: Pick<User, "id" | "role">, attempt: AiAttempt, usage: AiUsageToday): Promise<BudgetCheck> {
  return checkBudget(user, attempt, { ...serverDeps, usageToday: async () => usage });
}
