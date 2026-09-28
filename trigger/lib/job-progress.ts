import { metadata } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jobs, type JobStatus } from "@/lib/db/schema";
import type { JobProgressMeta } from "@/lib/jobs/stages";

/* Task-side progress (feature 09). Writes to run metadata, which the
   browser follows live through Trigger.dev Realtime, and mirrors the same
   values to the jobs row so the history survives once the run is over.
   The db client comes from DATABASE_URL(_POOLED) in the Trigger.dev
   environment; tasks build with the react-server condition, so the
   server-only modules in lib/ load there too. */

/* `runId` is the job's run (jobs.trigger_run_id). A subtask passes its
   parent's run id and `asChild`, so the update lands on the run the
   browser is watching. */
export async function reportProgress(runId: string, p: JobProgressMeta, opts: { asChild?: boolean } = {}): Promise<void> {
  const target = opts.asChild ? metadata.parent : metadata;
  target.set("stage", p.stage).set("progress", p.progress).set("message", p.message);
  await metadata.flush();
  await db
    .update(jobs)
    .set({ status: "running", stage: p.stage, progress: p.progress, message: p.message })
    .where(eq(jobs.triggerRunId, runId));
}

export async function markJob(
  runId: string,
  status: JobStatus,
  fields: { progress?: number; message?: string; error?: string | null } = {},
): Promise<void> {
  await db
    .update(jobs)
    .set({ status, ...fields })
    .where(eq(jobs.triggerRunId, runId));
}

/* Lifecycle hooks every job task shares: running → completed / failed. */
export const jobHooks = {
  onStart: async ({ ctx }: { ctx: { run: { id: string } } }) => {
    await markJob(ctx.run.id, "running", { error: null });
  },
  onSuccess: async ({ ctx }: { ctx: { run: { id: string } } }) => {
    metadata.set("progress", 100);
    await markJob(ctx.run.id, "completed", { progress: 100 });
  },
  onFailure: async ({ ctx, error }: { ctx: { run: { id: string } }; error: unknown }) => {
    await markJob(ctx.run.id, "failed", { error: userFacingError(error) });
  },
};

/* Never store stack traces or raw provider errors for the UI. */
export function userFacingError(error: unknown): string {
  if (error instanceof Error && error.name === "EngineError") return error.message;
  if (error instanceof Error && error.name === "JobError") return error.message;
  if (error instanceof Error && error.name === "GenerationError") return error.message;
  return "Something went wrong while this job was running.";
}

/* Throw this for failures the user should read verbatim. */
export class JobError extends Error {
  override name = "JobError";
}
