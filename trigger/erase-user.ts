import { AbortTaskRunError, logger, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { eraseUser } from "@/lib/account/erase";
import { jobHooks } from "./lib/job-progress";

/* Feature 33: erase a deleted account. Started by the Clerk user.deleted
   webhook or an admin's Delete user (lib/account/erase.ts), for a row
   already marked deleted. Cancels the person's unfinished runs, deletes
   their private data and anonymises the row, then deletes their files.
   Every step is safe to repeat, so it retries; an account it never
   finishes is picked up by the daily prune-old-rows. */

const accountErase = queue({ name: "account-erase", concurrencyLimit: 1 });

export const eraseUserTask = schemaTask({
  id: "erase-user",
  schema: z.object({ userId: z.uuid(), requestedBy: z.uuid() }),
  queue: accountErase,
  retry: { maxAttempts: 5 },
  maxDuration: 600,
  ...jobHooks,
  run: async ({ userId, requestedBy }) => {
    const outcome = await eraseUser(userId, requestedBy);
    // A refusal (not deleted, a demo account) won't change on a retry.
    if (!outcome.ok) throw new AbortTaskRunError(outcome.reason);
    logger.info("Account erased", { userId, ...outcome.counts });
    return outcome.counts;
  },
});
