import "server-only";

import { eraseLeftovers, eraseUserRows, markUserDeleted, userForErase, type DeleteVia, type ErasedCounts } from "@/lib/db/user-erase";
import { isProtectedDemoAccount } from "@/lib/demo/accounts";
import { cancelJob, startJob } from "@/lib/jobs";
import { deleteBlobs, exportFolder, listBlobUrls, privateFolder } from "@/lib/storage/blob";

/* Account deletion (feature 33). Two steps:

   1. deleteAccount(): mark the row deleted (the person is signed out from
      then on) and start the erase-user task. The Clerk webhook and the
      admin's Delete user both call it, with the same idempotency key, so
      they never run the erase twice.
   2. eraseUser(), run by that task (or by the daily clean-up for an
      account whose erase never finished): cancel the person's unfinished
      runs, delete their private data and anonymise the row in one batch,
      then delete their files. The folders are listed, so a file the rows
      no longer point at goes too, and a retry after a failed file delete
      finds them again. What's kept is in lib/db/user-erase.ts. */

export const ERASE_KIND = "erase-user";

export async function deleteAccount(userId: string, by: { actorId: string; via: DeleteVia }): Promise<{ marked: boolean }> {
  const marked = await markUserDeleted(userId, by);
  await startErase(userId, by.actorId);
  return { marked };
}

/* `key` defaults to the one both callers share; the daily clean-up passes
   a new one, since an old run with the shared key may have failed. */
export async function startErase(userId: string, requestedBy: string, idempotencyKey = `user:${userId}:erase`): Promise<void> {
  await startJob({
    kind: ERASE_KIND,
    entity: { type: "user", id: userId },
    payload: { userId, requestedBy },
    createdBy: requestedBy,
    idempotencyKey,
    // Waits for a worker for a day; the daily clean-up covers longer.
    ttl: "24h",
  });
}

export type EraseOutcome =
  | { ok: true; counts: ErasedCounts & { files: number; jobsCanceled: number } }
  | { ok: false; reason: string };

export async function eraseUser(userId: string, requestedBy: string): Promise<EraseOutcome> {
  const user = await userForErase(userId);
  if (!user) return { ok: false, reason: "That account doesn't exist." };
  // Only an account already marked deleted is ever erased.
  if (!user.deletedAt) return { ok: false, reason: "That account hasn't been deleted." };
  if (isProtectedDemoAccount(user.email)) return { ok: false, reason: "The demo accounts can't be erased in demo mode." };

  const left = await eraseLeftovers(user.id);
  // Stop runs first, so none writes a file after the folders are cleared.
  await Promise.all(left.jobs.map(cancelJob));
  const counts = await eraseUserRows(user, requestedBy);
  const files = await deleteUserFiles(user.id, left.blobUrls);
  return { ok: true, counts: { ...counts, files, jobsCanceled: left.jobs.length } };
}

/* Throws when Blob refuses, so the task retries; submission files are
   kept with the submissions (academic records). */
async function deleteUserFiles(userId: string, known: string[]): Promise<number> {
  const listed = [...(await listBlobUrls(privateFolder(userId))), ...(await listBlobUrls(exportFolder(userId)))];
  const urls = [...new Set([...known, ...listed])];
  for (let i = 0; i < urls.length; i += 500) await deleteBlobs(urls.slice(i, i + 500));
  return urls.length;
}
