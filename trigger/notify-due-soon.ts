import { logger, schedules } from "@trigger.dev/sdk";
import { notifyDueSoon } from "@/lib/db/notifications";

/* "Due soon" notifications (feature 21): once a day, every student gets a
   notice for each assignment due in the next 24 hours that they can see
   and haven't handed in. One SQL statement (lib/db/notifications.ts);
   its dedupe key makes a retry or a second run send nothing twice. The
   schedule is declared here, so deploying the task creates it (and the
   dev worker creates a dev copy). 06:00 UTC is 11:30 IST. */

export const notifyDueSoonTask = schedules.task({
  id: "notify-due-soon",
  cron: "0 6 * * *",
  retry: { maxAttempts: 3 },
  maxDuration: 120,
  run: async (payload) => {
    const sent = await notifyDueSoon(payload.timestamp);
    logger.info("Due-soon notifications sent", { sent, at: payload.timestamp.toISOString() });
    return { sent };
  },
});
