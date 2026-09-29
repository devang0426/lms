"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import { canonicalYoutubeUrl } from "@/lib/ai/ingest/youtube";
import { createDocument, getDocument } from "@/lib/db/documents";
import { documents, lessons, type User } from "@/lib/db/schema";
import { retryDocumentIngest, startLinkIngest } from "@/lib/documents";
import { checkUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { deleteBlobs } from "@/lib/storage/blob";
import { blobPaths, documentKindFor, UPLOAD_KINDS } from "@/lib/storage/upload-kinds";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { getVideo, prepareVideoRow, retryVideoProcessingRun, startLessonIndexing } from "@/lib/video/lessons";

/* Lesson editor: video uploads (feature 10) and documents (feature 18). zod → course staff → write
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

/* ---- Documents (feature 18) ------------------------------------------------
   PDF, Word and recordings upload straight to Blob like videos; web pages
   and YouTube links are saved and fetched by the task (through the SSRF
   guard). The task reads, drafts (reading lessons) and indexes them. */

const docFileSchema = z.object({
  lessonId: z.uuid(),
  file: z.object({ name: z.string().min(1).max(300), size: z.number().int().positive(), type: z.string().max(120) }),
});

export async function prepareDocumentUpload(
  input: z.input<typeof docFileSchema>,
): Promise<ActionResult<{ documentId: string; pathname: string }>> {
  const parsed = docFileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "That file couldn't be read.");
  const { lessonId, file } = parsed.data;
  const staff = await asLessonStaff(lessonId);
  if ("ok" in staff) return staff;

  const kind = documentKindFor(file.type);
  if (!kind) return fail("invalid", "Add a PDF, a Word document (.docx) or an audio recording (MP3, M4A, WAV).");
  if (file.size > UPLOAD_KINDS["lesson-document"].maxBytes) return fail("invalid", "That file is over 200 MB. Split it or compress it first.");

  const pathname = blobPaths.doc(lessonId, file.name);
  const doc = await createDocument({
    lessonId,
    kind,
    title: titleFromFileName(file.name),
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    status: "uploading",
    createdBy: staff.user.id,
  });
  await auditInsert({ actorId: staff.user.id, action: "document.upload_started", entityType: "lesson", entityId: lessonId, data: { documentId: doc.id, name: file.name, kind } });
  return ok({ documentId: doc.id, pathname });
}

const linkSchema = z.object({ lessonId: z.uuid(), url: z.string().trim().min(1, "Paste a link first.").max(2000) });

export async function addDocumentLink(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That link couldn't be read.");
  const { lessonId } = parsed.data;
  const staff = await asLessonStaff(lessonId);
  if ("ok" in staff) return staff;

  const youtube = canonicalYoutubeUrl(parsed.data.url);
  let url: string;
  try {
    // The same checks the fetch makes, so an obviously bad link fails here.
    url = youtube ?? checkUrl(parsed.data.url).toString();
  } catch (err) {
    return fail("invalid", err instanceof SafeFetchError ? err.message : "That link couldn't be read.");
  }
  const doc = await createDocument({
    lessonId,
    kind: youtube ? "youtube" : "url",
    title: youtube ? "YouTube video" : new URL(url).hostname,
    url,
    status: "processing",
    createdBy: staff.user.id,
  });
  await auditInsert({ actorId: staff.user.id, action: "document.link_added", entityType: "lesson", entityId: lessonId, data: { documentId: doc.id, url } });
  await startLinkIngest(doc, staff.user.id);
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${lessonId}`);
  return ok();
}

const docRef = z.object({ lessonId: z.uuid(), documentId: z.uuid() });

export async function retryDocument(input: z.input<typeof docRef>): Promise<void> {
  const parsed = docRef.safeParse(input);
  if (!parsed.success) return;
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return;
  const doc = await getDocument(parsed.data.documentId);
  if (!doc || doc.lessonId !== parsed.data.lessonId) return;
  await retryDocumentIngest(doc, staff.user.id);
  await auditInsert({ actorId: staff.user.id, action: "document.retry", entityType: "lesson", entityId: doc.lessonId, data: { documentId: doc.id } });
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${doc.lessonId}`);
}

/* Removes the document, its file and its passages. A published lesson is
   re-indexed; drafts made from it stay until they're regenerated. */
export async function removeDocument(input: z.input<typeof docRef>): Promise<ActionResult> {
  const parsed = docRef.safeParse(input);
  if (!parsed.success) return fail("invalid", "That document couldn't be found.");
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  const [doc] = await db.batch([
    db.delete(documents).where(and(eq(documents.id, parsed.data.documentId), eq(documents.lessonId, parsed.data.lessonId))).returning(),
    auditInsert({ actorId: staff.user.id, action: "document.removed", entityType: "lesson", entityId: parsed.data.lessonId, data: { documentId: parsed.data.documentId } }),
  ]);
  const removed = doc[0];
  if (!removed) return fail("not_found", "That document was already removed.");
  if (removed.blobUrl) await deleteBlobs([removed.blobUrl]).catch((err) => console.warn("[documents] blob not deleted", err));
  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, removed.lessonId!));
  if (lesson?.status === "published") await startLessonIndexing(removed.lessonId!, staff.user.id);
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${parsed.data.lessonId}`);
  return ok();
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^./\]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Document";
}
