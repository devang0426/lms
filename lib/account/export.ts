import "server-only";

import { buildExportDocument, exportFileName } from "@/lib/account/export-document";
import { EXPORT_FAILED_MESSAGE, EXPORT_LIMIT_MESSAGE, exportPhase, type ExportPhase } from "@/lib/account/rules";
import {
  createExportRequest,
  exportForTask,
  latestExportFor,
  loadUserExportRows,
  markExportFailed,
  markExportReady,
} from "@/lib/db/data-export";
import { isLimitError } from "@/lib/db/limits";
import type { Job, User } from "@/lib/db/schema";
import { getJobAccessToken, reconcileJob, startJob } from "@/lib/jobs";
import { TERMINAL_JOB_STATES } from "@/lib/jobs/stages";
import { deleteBlobs, exportFolder, putBlob } from "@/lib/storage/blob";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* "Download my data" (feature 33). The Profile page asks for an export
   (requestExport); the export-user-data task builds the JSON file in the
   background (buildUserExport); /exports/[id] hands the file to its owner
   until it expires. The file is never built inside a request. */

export const EXPORT_KIND = "export-user-data";

const START_FAILED = "Your file couldn't be started. Try again in a minute.";

export async function requestExport(user: Pick<User, "id">): Promise<ActionResult<{ exportId: string }>> {
  let exportId: string;
  try {
    exportId = (await createExportRequest(user.id)).id;
  } catch (err) {
    if (isLimitError(err)) return fail("conflict", EXPORT_LIMIT_MESSAGE);
    throw err;
  }
  try {
    await startJob({
      kind: EXPORT_KIND,
      entity: { type: "export", id: exportId },
      payload: { exportId },
      createdBy: user.id,
      idempotencyKey: `export:${exportId}`,
      concurrencyKey: user.id,
    });
  } catch (err) {
    console.error("[export] couldn't start the job", err);
    await markExportFailed(exportId, START_FAILED);
    return fail("conflict", START_FAILED);
  }
  return ok({ exportId });
}

export interface ExportCard {
  phase: ExportPhase;
  exportId: string | null;
  /* While building: the run to follow live, with a token for it alone,
     and the job row's last known state. */
  run: { id: string; accessToken: string; job: Pick<Job, "status" | "stage" | "progress" | "message" | "error"> } | null;
}

/* The Profile page's "Your data" card: the newest export and its run,
   reconciled, since a crash skips the task's hooks. The run is the
   owner's own (they started it). */
export async function exportCardFor(user: Pick<User, "id">, now: Date): Promise<ExportCard> {
  const latest = await latestExportFor(user.id);
  if (!latest) return { phase: { phase: "none" }, exportId: null, run: null };
  const job = latest.job ? await reconcileJob(latest.job) : null;
  const phase = exportPhase(latest.row, job, now);
  const live = phase.phase === "building" && job !== null && !TERMINAL_JOB_STATES.includes(job.status);
  return {
    phase,
    exportId: latest.row.id,
    run:
      live && job
        ? {
            id: job.triggerRunId,
            accessToken: await getJobAccessToken(job),
            job: { status: job.status, stage: job.stage, progress: job.progress, message: job.message, error: job.error },
          }
        : null,
  };
}

/* The task body. Safe to run again: a row no longer being built is left
   alone. A person deleted meanwhile gets no file. */
export async function buildUserExport(exportId: string, progress: (stage: "collect" | "save", pct: number, message: string) => Promise<void>): Promise<{ bytes: number } | null> {
  const row = await exportForTask(exportId);
  if (!row || row.status !== "building") return null;
  if (row.deleted) {
    await markExportFailed(exportId, EXPORT_FAILED_MESSAGE);
    return null;
  }

  await progress("collect", 10, "Collecting your courses, study history and notes");
  const rows = await loadUserExportRows(row.userId);
  if (!rows) return null;
  const now = new Date();
  const body = JSON.stringify(buildExportDocument(rows, { appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null, now }), null, 2);

  await progress("save", 70, "Saving the file");
  const file = await putBlob(`${exportFolder(row.userId)}${exportFileName(now)}`, body, { contentType: "application/json" });
  const bytes = Buffer.byteLength(body, "utf8");
  if (!(await markExportReady(exportId, { url: file.url, pathname: file.pathname, size: bytes }))) {
    // The row went meanwhile (the account was erased): the file goes too.
    await deleteBlobs([file.url]);
    return null;
  }
  return { bytes };
}
