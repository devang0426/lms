import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { lessons, videos, type LessonStatus } from "./schema";

/* Video status writes shared by the web app and the video tasks
   (feature 26), so a stuck video is recovered the same way wherever it's
   noticed: startVideoProcessing when the run can't be queued, the lesson
   editor when the run ended unfinished, and video-process's own failure
   hooks. */

/* A lesson that was `processing` goes back to where it was before its
   video started: ready if it still has a ready video, else draft. A
   published lesson never left published (it keeps playing its live
   video), so only a processing lesson moves. Returns the new status, or
   null when the lesson wasn't processing. */
export async function restoreLessonStatus(lessonId: string): Promise<LessonStatus | null> {
  const [row] = await db
    .update(lessons)
    .set({
      status: sql`case when exists (select 1 from videos where videos.lesson_id = ${lessonId} and videos.status = 'ready')
        then 'ready'::lesson_status else 'draft'::lesson_status end`,
    })
    .where(and(eq(lessons.id, lessonId), eq(lessons.status, "processing")))
    .returning({ status: lessons.status });
  return row?.status ?? null;
}

/* Marks a video that is still `processing` failed, with a message the
   instructor can act on, and restores its lesson, so the editor offers
   Retry and the uploader again. A video that has moved on (ready,
   rejected, already failed) is left alone: returns null. Otherwise
   returns the lesson's status afterwards (null if it didn't change). */
export async function failProcessingVideo(videoId: string, error: string): Promise<{ lessonStatus: LessonStatus | null } | null> {
  const [moved] = await db
    .update(videos)
    .set({ status: "failed", error })
    .where(and(eq(videos.id, videoId), eq(videos.status, "processing")))
    .returning({ lessonId: videos.lessonId });
  if (!moved) return null;
  return { lessonStatus: await restoreLessonStatus(moved.lessonId) };
}
