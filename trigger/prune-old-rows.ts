import { logger, schedules } from "@trigger.dev/sdk";
import { finishUnerasedAccounts, pruneExpiredExports } from "@/lib/account/cleanup";
import { pruneOldRows } from "@/lib/db/retention";

/* Retention (feature 30, R12): once a day, read notifications and finished
   jobs older than 90 days are deleted; each entity keeps its newest run of
   each kind, which pages read for their state. ai_usage and audit_log are
   kept. The rules are in lib/retention/rules.ts, the SQL in
   lib/db/retention.ts. Deleting twice is harmless, so a retry is safe. The
   schedule is declared here, so deploying the task creates it. 21:30 UTC
   is 03:00 IST, the quietest hour.
   Feature 33 adds two steps: data exports past their 7 days (the files,
   then the rows), and deleted accounts whose erase never finished
   (lib/account/cleanup.ts). */

export const pruneOldRowsTask = schedules.task({
  id: "prune-old-rows",
  cron: "30 21 * * *",
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  run: async (payload) => {
    const pruned = await pruneOldRows(payload.timestamp);
    const exports = await pruneExpiredExports(payload.timestamp);
    const accounts = await finishUnerasedAccounts(payload.timestamp);
    logger.info("Old rows pruned", {
      notifications: pruned.notifications,
      jobs: pruned.jobs,
      exports,
      accountsErased: accounts.erased,
      accountsFailed: accounts.failed,
      cutoff: pruned.cutoff.toISOString(),
    });
    return { notifications: pruned.notifications, jobs: pruned.jobs, exports, accountsErased: accounts.erased };
  },
});
