import "server-only";

import { auth, runs, tasks } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import { jobs, videos, type Job, type User } from "@/lib/db/schema";
import { jobStateFromRun, TERMINAL_JOB_STATES, type JobKind, type JobState } from "./stages";

/* Background jobs (feature 09). The web app only starts runs and reads
   them; the work happens in Trigger.dev tasks (trigger/), which mirror
   their progress to the jobs row. Payloads are IDs only. */

export interface StartJobInput {
  kind: JobKind;
  entity: { type: string; id: string };
  payload: Record<string, string | number | boolean>;
  createdBy: string;
  /* Same key → same run (Trigger.dev dedupes), e.g. `lesson:${id}:process`.
     Use a new key to force a fresh run (retry). */
  idempotencyKey: string;
}

export async function startJob(input: StartJobInput): Promise<Job> {
  const handle = await tasks.trigger(input.kind, input.payload, {
    idempotencyKey: input.idempotencyKey,
    tags: [`${input.entity.type}_${input.entity.id}`.slice(0, 128)],
  });

  // A deduped trigger returns the existing run, which already has a row.
  await db
    .insert(jobs)
    .values({
      kind: input.kind,
      entityType: input.entity.type,
      entityId: input.entity.id,
      triggerRunId: handle.id,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing({ target: jobs.triggerRunId });

  const [row] = await db.select().from(jobs).where(eq(jobs.triggerRunId, handle.id)).limit(1);
  return row;
}

/* A job the viewer may watch (see canViewJob), reconciled with its run. */
export async function getJobForViewer(jobId: string, viewer: Pick<User, "id" | "role">): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!row) return null;
  if (!(await canViewJob(row, viewer))) return null;
  return reconcileJob(row);
}

/* Admins see every job; others see their own, and course staff see the
   jobs of their lessons and their lessons' videos. */
async function canViewJob(job: Job, viewer: Pick<User, "id" | "role">): Promise<boolean> {
  if (viewer.role === "admin" || job.createdBy === viewer.id) return true;
  let lessonId: string | null = null;
  if (job.entityType === "lesson") lessonId = job.entityId;
  if (job.entityType === "video") {
    const [video] = await db.select({ lessonId: videos.lessonId }).from(videos).where(eq(videos.id, job.entityId)).limit(1);
    lessonId = video?.lessonId ?? null;
  }
  const courseId = lessonId ? await courseIdForLesson(lessonId) : null;
  return courseId !== null && (await getCourseAccess(courseId, viewer)) === "staff";
}

/* The task's hooks keep the row current, but they never run when a run
   dies before the task starts (bad payload, crash, expiry), or when the
   hook's own write fails. So an unfinished row is checked against the
   run's real status before it is shown, and corrected if the run ended. */
export async function reconcileJob(job: Job): Promise<Job> {
  if (TERMINAL_JOB_STATES.includes(job.status)) return job;
  let status: JobState;
  try {
    status = jobStateFromRun((await runs.retrieve(job.triggerRunId)).status);
  } catch {
    return job; // Trigger.dev unreachable: show what we have.
  }
  if (!TERMINAL_JOB_STATES.includes(status)) return job;

  const fields =
    status === "failed"
      ? { status, error: job.error ?? "This job stopped before it could finish. It's safe to try again." }
      : status === "completed"
        ? { status, progress: 100 }
        : { status };
  const [updated] = await db.update(jobs).set(fields).where(eq(jobs.id, job.id)).returning();
  return updated ?? job;
}

export async function latestJobFor(entity: { type: string; id: string }, kind?: JobKind): Promise<Job | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.entityType, entity.type), eq(jobs.entityId, entity.id), kind ? eq(jobs.kind, kind) : undefined))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return row ? reconcileJob(row) : null;
}

export async function listRecentJobs(createdBy: string, limit = 5): Promise<Job[]> {
  return db.select().from(jobs).where(eq(jobs.createdBy, createdBy)).orderBy(desc(jobs.createdAt)).limit(limit);
}

/* A browser token that can read this one run over Realtime, nothing else.
   Call only after getJobForViewer() said yes. */
export async function getJobAccessToken(job: Pick<Job, "triggerRunId">): Promise<string> {
  return auth.createPublicToken({
    scopes: { read: { runs: [job.triggerRunId] } },
    expirationTime: "2h",
  });
}
