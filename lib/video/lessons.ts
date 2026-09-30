import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, type BatchRows } from "@/lib/db/client";
import { lessons, transcriptSegments, videos, type LessonStatus, type Video } from "@/lib/db/schema";
import { failProcessingVideo } from "@/lib/db/videos";
import { latestJobPerEntityQuery, reconcileJob, startJob } from "@/lib/jobs";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { PROCESSING_NOT_STARTED, stuckVideoError } from "./recovery";

/* Video lessons, web side (feature 10). The browser uploads straight to
   Blob; these functions prepare the row, start processing once the file
   has landed, and read the state back for the lesson editor. The work
   itself runs in trigger/video-process.ts. Callers check course staff. */

export const videoEntity = (videoId: string) => ({ type: "video", id: videoId });

/* A new videos row for an upload about to start. */
export async function prepareVideoRow(lessonId: string, userId: string): Promise<Video> {
  const [row] = await db.insert(videos).values({ lessonId, createdBy: userId, status: "uploading" }).returning();
  return row;
}

/* The file is in Blob: record it and start processing. Runs from Blob's
   completion callback and from the local-dev confirm action, so it is
   idempotent — only an `uploading` row moves on, and the job key is per
   video, so a second call reuses the same run. If the run can't be queued
   (Trigger.dev down, a bad key), the video is marked failed and the lesson
   restored, so the editor offers Retry (feature 26); the error goes back
   to the uploader. */
export async function startVideoProcessing(input: {
  videoId: string;
  lessonId: string;
  userId: string;
  blob: { url: string; pathname: string; size?: number };
}): Promise<ActionResult> {
  const [moved] = await db
    .update(videos)
    .set({
      blobUrl: input.blob.url,
      pathname: input.blob.pathname,
      sizeBytes: input.blob.size ?? null,
      status: "processing",
      error: null,
    })
    .where(and(eq(videos.id, input.videoId), eq(videos.lessonId, input.lessonId), eq(videos.status, "uploading")))
    .returning({ id: videos.id });
  if (!moved) return ok();

  // A published lesson keeps playing its current video until the new one is ready.
  await db
    .update(lessons)
    .set({ status: "processing" })
    .where(and(eq(lessons.id, input.lessonId), sql`${lessons.status} <> 'published'`));

  try {
    await startJob({
      kind: "video-process",
      entity: videoEntity(input.videoId),
      payload: { videoId: input.videoId },
      createdBy: input.userId,
      idempotencyKey: `lesson:${input.lessonId}:video:${input.videoId}:process`,
    });
  } catch (err) {
    console.error(`[video-process] couldn't queue video ${input.videoId}`, err);
    await failProcessingVideo(input.videoId, PROCESSING_NOT_STARTED);
    return fail("conflict", "The video uploaded, but processing couldn't start. Use Try again above in a minute.");
  }
  return ok();
}

/* Index a just-published lesson for the assistant (feature 13). Publishing
   has already happened, so a failure to queue is logged, not returned: the
   lesson is live, and publishing again re-queues it. Each publish gets its
   own run; the task rebuilds the whole index, so repeats are harmless. */
export async function startLessonIndexing(lessonId: string, userId: string): Promise<void> {
  try {
    await startJob({
      kind: "index-lesson",
      entity: { type: "lesson", id: lessonId },
      payload: { lessonId, requestedBy: userId },
      createdBy: userId,
      idempotencyKey: `lesson:${lessonId}:index:${Date.now()}`,
    });
  } catch (err) {
    console.error(`[index-lesson] couldn't queue indexing for lesson ${lessonId}`, err);
  }
}

/* Start a fresh run for a video whose processing failed (not rejected).
   The run is queued before the video goes back to `processing`: the other
   way round, the editor could meet a processing video beside the old
   failed run and fail it again (feature 26). If queueing fails, the video
   stays failed and says so. */
export async function retryVideoProcessingRun(video: Video, userId: string): Promise<ActionResult> {
  try {
    await startJob({
      kind: "video-process",
      entity: videoEntity(video.id),
      payload: { videoId: video.id },
      createdBy: userId,
      idempotencyKey: `lesson:${video.lessonId}:video:${video.id}:process:retry:${Date.now()}`,
    });
  } catch (err) {
    console.error(`[video-process] couldn't queue a retry for video ${video.id}`, err);
    await db.update(videos).set({ error: PROCESSING_NOT_STARTED }).where(and(eq(videos.id, video.id), eq(videos.status, "failed")));
    return fail("conflict", "Processing couldn't start. Try again in a minute.");
  }
  await db.update(videos).set({ status: "processing", error: null }).where(and(eq(videos.id, video.id), eq(videos.status, "failed")));
  return ok();
}

export async function getVideo(videoId: string): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  return row ?? null;
}

/* What the lesson editor shows: the newest upload, its latest job, the
   video currently live (may be an older one while a replacement runs),
   and how many transcript segments it has. A newest upload still
   `processing` whose run ended unfinished (crashed, cancelled, expired) is
   marked failed here, as lib/documents does for documents (feature 26);
   `lessonStatus` is then the lesson's restored status. */
export function videoStateQueries(lessonId: string) {
  // The newest upload's id (jobs name their entity as text), and the live video.
  const newest = sql`(select v.id::text from videos v where v.lesson_id = ${lessonId} order by v.created_at desc limit 1)`;
  const live = db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  return [
    db.select().from(videos).where(eq(videos.lessonId, lessonId)).orderBy(desc(videos.createdAt)).limit(5),
    latestJobPerEntityQuery("video", "video-process", newest),
    db.select({ n: count() }).from(transcriptSegments).where(eq(transcriptSegments.videoId, live)),
  ] as const;
}

/* The state from videoStateQueries' rows (a page's batch, feature 29). */
export async function resolveVideoState([rows, jobRows, segments]: BatchRows<ReturnType<typeof videoStateQueries>>) {
  let latest = rows[0] ?? null;
  const live = rows.find((v) => v.status === "ready") ?? null;
  const job = jobRows[0] ? await reconcileJob(jobRows[0]) : null;
  let lessonStatus: LessonStatus | null = null;
  const stuck = latest ? stuckVideoError(latest, job) : null;
  if (latest && stuck) {
    const recovered = await failProcessingVideo(latest.id, stuck);
    if (recovered) {
      latest = { ...latest, status: "failed", error: stuck };
      lessonStatus = recovered.lessonStatus;
    }
  }
  return { latest, live, job, segmentCount: live ? (segments[0]?.n ?? 0) : 0, lessonStatus };
}

export async function getLessonVideoState(lessonId: string) {
  return resolveVideoState(await db.batch(videoStateQueries(lessonId)));
}

export async function lessonHasReadyVideo(lessonId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .limit(1);
  return Boolean(row);
}

export type LiveVideo = Pick<Video, "id" | "blobUrl" | "posterUrl" | "vttUrl" | "durationSec">;

const liveVideo = (lessonId: string) => and(eq(videos.lessonId, lessonId), eq(videos.status, "ready"));

/* The live (newest ready) video, for the lesson player's batch. Only run
   after getLessonForUser has passed: this hands out Blob URLs. */
export function liveVideoQuery(lessonId: string) {
  return db
    .select({ id: videos.id, blobUrl: videos.blobUrl, posterUrl: videos.posterUrl, vttUrl: videos.vttUrl, durationSec: videos.durationSec })
    .from(videos)
    .where(liveVideo(lessonId))
    .orderBy(desc(videos.createdAt))
    .limit(1);
}

export function toLiveVideo([video]: readonly LiveVideo[]): LiveVideo | null {
  return video?.blobUrl ? video : null;
}

/* The live video's transcript, read through the same "newest ready video"
   subquery, so it needs no earlier read (feature 29). */
export function liveSegmentsQuery(lessonId: string) {
  return db
    .select({ startSec: transcriptSegments.startSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(
      eq(
        transcriptSegments.videoId,
        db.select({ id: videos.id }).from(videos).where(liveVideo(lessonId)).orderBy(desc(videos.createdAt)).limit(1),
      ),
    )
    .orderBy(transcriptSegments.idx);
}

/* Length of the live video, for checking watch progress. */
export async function liveVideoDuration(lessonId: string): Promise<number | null> {
  const [row] = await db
    .select({ durationSec: videos.durationSec })
    .from(videos)
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  return row?.durationSec ?? null;
}
