"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import { lessons, type User } from "@/lib/db/schema";
import { blobPaths, UPLOAD_KINDS } from "@/lib/storage/upload-kinds";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { getVideo, prepareVideoRow, retryVideoProcessingRun } from "@/lib/video/lessons";

/* Lesson editor: video uploads (feature 10). zod → course staff → write
   (+ audit) → revalidate, like the builder's actions. */

async function asLessonStaff(lessonId: string): Promise<{ user: User; courseId: string } | ActionResult<never>> {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const courseId = await courseIdForLesson(lessonId);
  if (!courseId || (await getCourseAccess(courseId, user)) !== "staff") {
    return fail("not_found", "That lesson doesn't exist or isn't yours to edit.");
  }
  return { user, courseId };
}

const prepareSchema = z.object({
  lessonId: z.uuid(),
  file: z.object({ name: z.string().max(300), size: z.number().int().positive(), type: z.string().max(100) }),
});

/* Before the browser uploads: check the file's declared type and size and
   create the videos row the upload is recorded against. */
export async function prepareVideoUpload(
  input: z.input<typeof prepareSchema>,
): Promise<ActionResult<{ videoId: string; pathname: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "That file couldn't be read.");
  const { lessonId, file } = parsed.data;

  const staff = await asLessonStaff(lessonId);
  if ("ok" in staff) return staff;

  const [lesson] = await db.select({ kind: lessons.kind }).from(lessons).where(eq(lessons.id, lessonId));
  if (lesson?.kind !== "video") return fail("invalid", "Only video lessons take a video upload.");
  if (file.type !== "video/mp4") return fail("invalid", "Please upload an MP4 (H.264) file.");
  if (file.size > UPLOAD_KINDS["lesson-video"].maxBytes) {
    return fail("invalid", "This video is over 2 GB. Export it at 720p or a lower bitrate.");
  }

  const video = await prepareVideoRow(lessonId, staff.user.id);
  await auditInsert({
    actorId: staff.user.id,
    action: "video.upload_started",
    entityType: "lesson",
    entityId: lessonId,
    data: { videoId: video.id, name: file.name, size: file.size },
  });
  return ok({ videoId: video.id, pathname: blobPaths.videoSource(lessonId) });
}

/* Start a fresh processing run for a video that failed (not rejected). */
export async function retryVideo(videoId: string): Promise<void> {
  const video = await getVideo(videoId);
  if (!video || video.status !== "failed") return;
  const staff = await asLessonStaff(video.lessonId);
  if ("ok" in staff) return;
  await retryVideoProcessingRun(video, staff.user.id);
  await auditInsert({ actorId: staff.user.id, action: "video.retry", entityType: "lesson", entityId: video.lessonId, data: { videoId } });
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${video.lessonId}`);
}
