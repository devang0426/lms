import { logger, schemaTask } from "@trigger.dev/sdk";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { notifyDraftsReady } from "@/lib/db/notifications";
import { lessons, videos } from "@/lib/db/schema";
import { failProcessingVideo, restoreLessonStatus } from "@/lib/db/videos";
import { deleteBlobs } from "@/lib/storage/blob";
import { PROCESSING_STOPPED } from "@/lib/video/recovery";
import { jobHooks, JobError, reportProgress } from "./lib/job-progress";
import { loadVideo, updateVideo } from "./lib/video-db";
import { generateCardsTask, generateChaptersTask, generateNotesTask, generateQuizTask } from "./generate-lesson-content";
import { indexLesson } from "./index-lesson";
import { transcribeLesson } from "./transcribe-lesson";
import { videoFaststart } from "./video-faststart";
import { videoPoster } from "./video-poster";
import { videoProbe } from "./video-probe";

/* The video pipeline (features 10 and 12, architecture.md steps 3–10).
   Each step is a subtask run with triggerAndWait, so it retries on its
   own, and each one skips work whose output already exists — re-running a
   finished lesson does nothing. Progress goes to this run's metadata (the
   browser watches it) and to the jobs row. Once transcribed, the video is
   marked ready; then the AI drafts chapters, notes, cards and the quiz. If
   drafting stops, the video stays ready and the instructor regenerates
   from the review screen. */

type Step = { ok: true } | { ok: false; error: unknown };

export const videoProcess = schemaTask({
  id: "video-process",
  schema: z.object({ videoId: z.uuid() }),
  retry: { maxAttempts: 1 }, // the subtasks retry; a failed parent is retried by the instructor
  maxDuration: 7200,
  ...jobHooks,
  /* A failed step marks the video itself (fail() below). Anything else
     that ends the run (a throw outside the steps, a timeout) would leave
     it `processing`, with no Retry and Publish refused: mark it failed and
     put the lesson back (feature 26). A crash or out-of-memory skips these
     hooks; the lesson editor reconciles those (lib/video/lessons). */
  onFailure: async ({ ctx, error, payload }) => {
    await jobHooks.onFailure({ ctx, error });
    await failProcessingVideo(payload.videoId, PROCESSING_STOPPED);
  },
  onCancel: async ({ payload }) => {
    await failProcessingVideo(payload.videoId, PROCESSING_STOPPED);
  },
  run: async ({ videoId }, { ctx }) => {
    const runId = ctx.run.id;
    const [row] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (row?.status === "rejected") throw new JobError(row.error ?? "This video can't be used.");
    const video = await loadVideo(videoId);

    const payload = { videoId, parentRunId: runId };
    const steps: [string, number, string, () => Promise<Step>][] = [
      ["probe", 3, "Checking the file…", () => videoProbe.triggerAndWait(payload)],
      ["faststart", 8, "Preparing it for streaming…", () => videoFaststart.triggerAndWait(payload)],
      ["poster", 15, "Making a poster image…", () => videoPoster.triggerAndWait(payload)],
      ["audio", 20, "Extracting the audio…", () => transcribeLesson.triggerAndWait(payload)],
    ];

    if (row?.status !== "ready") {
      for (const [stage, progress, message, run] of steps) {
        await reportProgress(runId, { stage, progress, message });
        const result = await run();
        if (!result.ok) await fail(videoId, video.lessonId, stage);
      }
      await reportProgress(runId, { stage: "captions", progress: 60, message: "Finishing the video…" });
      await finish(videoId);
      await reindexIfPublished(video.lessonId);
    }

    // Steps 8–10. Each skips kinds already drafted from this video.
    const content = { lessonId: video.lessonId, parentRunId: runId };
    const drafts: [string, () => Promise<Step>][] = [
      ["the chapters", () => generateChaptersTask.triggerAndWait(content)],
      ["the notes", () => generateNotesTask.triggerAndWait(content)],
      ["the flashcards", () => generateCardsTask.triggerAndWait(content)],
      ["the quiz", () => generateQuizTask.triggerAndWait(content)],
    ];
    for (const [label, run] of drafts) {
      const result = await run();
      if (!result.ok) {
        throw new JobError(`The video is ready, but drafting ${label} stopped. Open the review screen to try again.`);
      }
    }

    // New chapters mean new chunk boundaries and titles.
    await reindexIfPublished(video.lessonId);
    // Step 12: the uploader gets a "Drafts ready" notice with a link to the
    // review screen (feature 30). A notice that can't be written doesn't
    // fail a pipeline that has finished.
    await notifyDraftsReady(videoId).catch((err: unknown) =>
      logger.warn("Drafts-ready notice not sent", { videoId, error: err instanceof Error ? err.message : String(err) }),
    );
    await reportProgress(runId, { stage: "quiz", progress: 100, message: "Drafts ready to review." });
    return { skipped: false };
  },
});

/* A published lesson that got a new video is live with the new transcript,
   so its assistant index (feature 13) is rebuilt; the old chunks point at
   the old video's times. Unpublished lessons are indexed on Publish. */
async function reindexIfPublished(lessonId: string): Promise<void> {
  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (lesson?.status === "published") await indexLesson.trigger({ lessonId });
}

/* A rejection keeps its friendly message; anything else is marked failed
   and can be retried. The lesson goes back to where it was. */
async function fail(videoId: string, lessonId: string, stage: string): Promise<never> {
  const current = await loadVideo(videoId);
  await restoreLessonStatus(lessonId);
  if (current.status === "rejected") {
    // The file can never be used; keep the row (and its message), not the bytes.
    await deleteBlobs([current.blobUrl]);
    await updateVideo(videoId, { blobUrl: null });
    throw new JobError(current.error ?? "This video can't be used.");
  }
  const message = `Processing stopped while ${stageLabel(stage)}. It's safe to try again.`;
  await updateVideo(videoId, { status: "failed", error: message });
  throw new JobError(message);
}

function stageLabel(stage: string): string {
  return (
    { probe: "checking the file", faststart: "preparing it for streaming", poster: "making the poster", audio: "transcribing" }[stage] ??
    "processing"
  );
}

/* Mark ready, update the lesson, and remove older uploads for the lesson
   (their rows, segments and blobs) now that this one replaces them. */
async function finish(videoId: string): Promise<void> {
  const video = await loadVideo(videoId);
  await updateVideo(videoId, { status: "ready", error: null });
  await db
    .update(lessons)
    .set({
      durationSec: Math.round(video.durationSec ?? 0),
      // A published lesson stays published and now plays the new video.
      status: sql`case when ${lessons.status} = 'published' then 'published'::lesson_status else 'ready'::lesson_status end`,
    })
    .where(eq(lessons.id, video.lessonId));

  const older = await db
    .select()
    .from(videos)
    .where(and(eq(videos.lessonId, video.lessonId), lt(videos.createdAt, video.createdAt)));
  if (older.length === 0) return;
  const urls = older.flatMap((v) => [v.blobUrl, v.posterUrl, v.vttUrl]).filter((u): u is string => Boolean(u));
  await deleteBlobs(urls);
  for (const v of older) await db.delete(videos).where(eq(videos.id, v.id)); // segments cascade
}
