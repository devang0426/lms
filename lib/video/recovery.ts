import type { JobStatus, VideoStatus } from "@/lib/db/schema";
import { TERMINAL_JOB_STATES } from "@/lib/jobs/stages";

/* Stuck videos (feature 26). The task's own failure path only runs when a
   step fails. A run that couldn't be queued, crashed, ran out of memory,
   timed out, was cancelled or expired unpicked left the video
   `processing` for good: no Retry, no uploader, and Publish refused. These
   rules say when a video is stuck and what the lesson editor offers. Pure:
   lib/video/lessons applies them, trigger/video-process shares the
   messages. */

export const PROCESSING_STOPPED = "Processing stopped before it finished. It's safe to try again.";
export const PROCESSING_NOT_STARTED = "Processing couldn't start. Try again.";

type JobLike = { status: JobStatus; error: string | null };

function active(job: { status: JobStatus } | null): boolean {
  return job !== null && !TERMINAL_JOB_STATES.includes(job.status);
}

/* The error to record on a video that is still `processing` although its
   latest run has ended without completing, or null when it isn't stuck.
   A failed run's own message is kept (it may say which step stopped). */
export function stuckVideoError(video: { status: VideoStatus }, job: JobLike | null): string | null {
  if (video.status !== "processing" || job === null || active(job) || job.status === "completed") return null;
  return job.status === "failed" ? (job.error ?? PROCESSING_STOPPED) : PROCESSING_STOPPED;
}

export interface VideoEditorControls {
  /* The live JobProgress card. */
  progress: boolean;
  /* The "stopped, try again" notice. */
  retry: boolean;
  /* The drop zone, to upload or replace. */
  uploader: boolean;
}

/* What the lesson editor shows for the newest upload and its latest run.
   Retry whenever it failed; the uploader unless a run is working on it,
   so a stuck row can always be replaced. */
export function videoEditorControls(latest: { status: VideoStatus } | null, job: { status: JobStatus } | null): VideoEditorControls {
  const processing = latest?.status === "processing";
  return {
    progress: job !== null && ((processing && active(job)) || (latest?.status === "ready" && job.status !== "completed")),
    retry: latest?.status === "failed",
    uploader: !(processing && active(job)),
  };
}
