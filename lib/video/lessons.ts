import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lessons, transcriptSegments, videos, type Video } from "@/lib/db/schema";
import { latestJobFor, startJob } from "@/lib/jobs";

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
   video, so a second call reuses the same run. */
export async function startVideoProcessing(input: {
  videoId: string;
  lessonId: string;
  userId: string;
  blob: { url: string; pathname: string; size?: number };
}): Promise<void> {
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
  if (!moved) return;

  // A published lesson keeps playing its current video until the new one is ready.
  await db
    .update(lessons)
    .set({ status: "processing" })
    .where(and(eq(lessons.id, input.lessonId), sql`${lessons.status} <> 'published'`));

  await startJob({
    kind: "video-process",
    entity: videoEntity(input.videoId),
    payload: { videoId: input.videoId },
    createdBy: input.userId,
    idempotencyKey: `lesson:${input.lessonId}:video:${input.videoId}:process`,
  });
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
      payload: { lessonId },
      createdBy: userId,
      idempotencyKey: `lesson:${lessonId}:index:${Date.now()}`,
    });
  } catch (err) {
    console.error(`[index-lesson] couldn't queue indexing for lesson ${lessonId}`, err);
  }
}

/* Start a fresh run for a video whose processing failed (not rejected). */
export async function retryVideoProcessingRun(video: Video, userId: string): Promise<void> {
  await db.update(videos).set({ status: "processing", error: null }).where(eq(videos.id, video.id));
  await startJob({
    kind: "video-process",
    entity: videoEntity(video.id),
    payload: { videoId: video.id },
    createdBy: userId,
    idempotencyKey: `lesson:${video.lessonId}:video:${video.id}:process:retry:${Date.now()}`,
  });
}

export async function getVideo(videoId: string): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  return row ?? null;
}

/* What the lesson editor shows: the newest upload, its latest job, the
   video currently live (may be an older one while a replacement runs),
   and how many transcript segments it has. */
export async function getLessonVideoState(lessonId: string) {
  const rows = await db.select().from(videos).where(eq(videos.lessonId, lessonId)).orderBy(desc(videos.createdAt)).limit(5);
  const latest = rows[0] ?? null;
  const live = rows.find((v) => v.status === "ready") ?? null;
  const [job, segments] = await Promise.all([
    latest ? latestJobFor(videoEntity(latest.id), "video-process") : Promise.resolve(null),
    live
      ? db.select({ n: count() }).from(transcriptSegments).where(eq(transcriptSegments.videoId, live.id))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { latest, live, job, segmentCount: segments[0]?.n ?? 0 };
}

export async function lessonHasReadyVideo(lessonId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .limit(1);
  return Boolean(row);
}

export interface LessonPlayback {
  video: Pick<Video, "id" | "blobUrl" | "posterUrl" | "vttUrl" | "durationSec">;
  segments: { startSec: number; text: string }[];
}

/* The live video and its transcript, for the lesson player. Only call
   after getLessonForUser has passed: this hands out Blob URLs. */
export async function getLessonPlayback(lessonId: string): Promise<LessonPlayback | null> {
  const [video] = await db
    .select({ id: videos.id, blobUrl: videos.blobUrl, posterUrl: videos.posterUrl, vttUrl: videos.vttUrl, durationSec: videos.durationSec })
    .from(videos)
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  if (!video?.blobUrl) return null;
  const segments = await db
    .select({ startSec: transcriptSegments.startSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, video.id))
    .orderBy(transcriptSegments.idx);
  return { video, segments };
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
