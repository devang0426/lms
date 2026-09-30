import "server-only";

import { sql } from "drizzle-orm";
import { FINISHED_JOB_STATUSES, retentionCutoff } from "@/lib/retention/rules";
import { db } from "./client";

/* The daily clean-up (feature 30, R12; task prune-old-rows). The rules and
   their tests are in lib/retention/rules.ts; these statements apply them:
   - read notifications older than the cutoff;
   - finished jobs that finished before it, except each entity's newest run
     of each kind (notificationExpired and expiredJobs).
   ai_usage and audit_log are never deleted. Both statements go in one
   batch. Returns how many rows went. */
export async function pruneOldRows(now: Date): Promise<{ notifications: number; jobs: number; cutoff: Date }> {
  const cutoff = retentionCutoff(now);
  const at = cutoff.toISOString();
  const finished = sql.join(
    FINISHED_JOB_STATUSES.map((s) => sql`${s}::job_status`),
    sql`, `,
  );
  const [notices, jobRows] = await db.batch([
    db.execute<{ n: number }>(sql`
      with gone as (
        delete from notifications
        where read_at is not null and created_at < ${at}::timestamptz
        returning 1
      )
      select count(*)::int as n from gone`),
    db.execute<{ n: number }>(sql`
      with gone as (
        delete from jobs j
        where j.status in (${finished}) and j.updated_at < ${at}::timestamptz
          and exists (
            select 1 from jobs newer
            where newer.entity_type = j.entity_type and newer.entity_id = j.entity_id and newer.kind = j.kind
              and (newer.created_at, newer.id) > (j.created_at, j.id)
          )
        returning 1
      )
      select count(*)::int as n from gone`),
  ]);
  return { notifications: Number(notices.rows[0]?.n ?? 0), jobs: Number(jobRows.rows[0]?.n ?? 0), cutoff };
}
