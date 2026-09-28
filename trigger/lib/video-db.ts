import { AbortTaskRunError } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { videos, type Video } from "@/lib/db/schema";

/* Shared by the video tasks (feature 10). Payloads carry IDs only. */

export const videoTaskPayload = z.object({
  videoId: z.uuid(),
  /* The video-process run the browser watches; subtasks report to it. */
  parentRunId: z.string().min(1),
});

export async function loadVideo(videoId: string): Promise<Video & { blobUrl: string; pathname: string }> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  // Nothing to retry if the row or its file is gone.
  if (!video) throw new AbortTaskRunError(`Video ${videoId} not found.`);
  if (!video.blobUrl || !video.pathname) throw new AbortTaskRunError(`Video ${videoId} has no uploaded file.`);
  return { ...video, blobUrl: video.blobUrl, pathname: video.pathname };
}

export async function updateVideo(videoId: string, fields: Partial<typeof videos.$inferInsert>): Promise<void> {
  await db.update(videos).set(fields).where(eq(videos.id, videoId));
}
