import { ERASE_SWEEP_AFTER_MS } from "@/lib/account/rules";
import type { JobStatus } from "@/lib/db/schema";

/* What the daily clean-up deletes (feature 30, R12). Pure: the SQL in
   lib/db/retention.ts applies these same rules, and the tests pin them.
   ai_usage and audit_log are kept for good: they're the cost record and
   the record of who did what. */

export const RETENTION_DAYS = 90;

export const FINISHED_JOB_STATUSES = ["completed", "failed", "canceled"] as const satisfies readonly JobStatus[];

export function retentionCutoff(now: Date, days = RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/* A notification goes once it's been read and is older than the cutoff.
   An unread one stays, however old: nobody has seen it yet. */
export function notificationExpired(n: { readAt: Date | null; createdAt: Date }, cutoff: Date): boolean {
  return n.readAt !== null && n.createdAt < cutoff;
}

export interface JobFacts {
  id: string;
  kind: string;
  entityType: string;
  entityId: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

/* The jobs that go: finished (completed, failed or cancelled) before the
   cutoff, except the newest run of each kind for each entity. Pages read
   that one for their state: a note whose drafting failed offers "Try
   again" because its latest run failed, and the review screen shows each
   kind's last run. So every entity keeps one row per kind, and only the
   history behind it goes. Newest = latest createdAt, then id (rows made in
   one batch share a timestamp). */
export function expiredJobs<T extends JobFacts>(jobs: readonly T[], cutoff: Date): T[] {
  const newest = new Map<string, T>();
  for (const job of jobs) {
    const key = `${job.entityType}\u0000${job.entityId}\u0000${job.kind}`;
    const current = newest.get(key);
    if (!current || isNewer(job, current)) newest.set(key, job);
  }
  const finished: readonly JobStatus[] = FINISHED_JOB_STATUSES;
  return jobs.filter(
    (job) =>
      finished.includes(job.status) &&
      job.updatedAt < cutoff &&
      newest.get(`${job.entityType}\u0000${job.entityId}\u0000${job.kind}`) !== job,
  );
}

function isNewer(a: JobFacts, b: JobFacts): boolean {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  return byTime !== 0 ? byTime > 0 : a.id > b.id;
}

/* ---- Feature 33 --------------------------------------------------------------
   A data export's file is kept until its `expiresAt` (7 days after it was
   asked for; lib/account/rules.ts), then the file and its row go. */
export function exportExpired(e: { expiresAt: Date }, now: Date): boolean {
  return e.expiresAt <= now;
}

/* A deleted account whose erase hasn't finished an hour later (its run
   couldn't start, or failed every retry) is erased by the daily clean-up
   itself. An erased one is done. */
export function needsErase(u: { deletedAt: Date | null; erasedAt: Date | null }, now: Date, afterMs = ERASE_SWEEP_AFTER_MS): boolean {
  return u.deletedAt !== null && u.erasedAt === null && now.getTime() - u.deletedAt.getTime() > afterMs;
}
