import "server-only";

import { eraseUser } from "@/lib/account/erase";
import { ERASE_SWEEP_AFTER_MS, ERASE_SWEEP_BATCH } from "@/lib/account/rules";
import { deleteExportRows, expiredExports } from "@/lib/db/data-export";
import { unerasedDeletedUsers } from "@/lib/db/user-erase";
import { deleteBlobs } from "@/lib/storage/blob";

/* Feature 33's part of the daily prune-old-rows (the rules and their
   tests are exportExpired and needsErase in lib/retention/rules.ts). */

/* Expired exports: the files first, then the rows. If Blob refuses, this
   throws and the rows stay, so the next run (or the task's retry) finds
   the files again. */
export async function pruneExpiredExports(now: Date): Promise<number> {
  const expired = await expiredExports(now);
  const urls = expired.flatMap((e) => (e.blobUrl ? [e.blobUrl] : []));
  if (urls.length > 0) await deleteBlobs(urls);
  return deleteExportRows(expired.map((e) => e.id));
}

/* Deleted accounts whose erase never finished, erased here, a few a day.
   One that fails is logged and tried again tomorrow. */
export async function finishUnerasedAccounts(now: Date): Promise<{ erased: number; failed: number }> {
  const pending = await unerasedDeletedUsers(new Date(now.getTime() - ERASE_SWEEP_AFTER_MS), ERASE_SWEEP_BATCH);
  let erased = 0;
  let failed = 0;
  for (const { id } of pending) {
    try {
      // Nobody asked this time: the erase is recorded as the account's own.
      const outcome = await eraseUser(id, id);
      if (outcome.ok) erased++;
      else failed++;
    } catch (err) {
      console.error(`[erase] account ${id} couldn't be erased`, err);
      failed++;
    }
  }
  return { erased, failed };
}
