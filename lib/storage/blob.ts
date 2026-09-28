import "server-only";

import { BlobNotFoundError, del, head, put, type HeadBlobResult, type PutBlobResult } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import { auditLog } from "@/lib/db/schema";
import { startVideoProcessing } from "@/lib/video/lessons";
import type { TokenPayload, UploadDeps } from "./authorize";
import { isDemoLectureUrl } from "./upload-kinds";

export { blobPaths, safeFileName, UPLOAD_KINDS, type UploadKind } from "./upload-kinds";

/* Vercel Blob helpers (feature 09). The store is PUBLIC: Blob access mode
   is fixed per store, and this one was created public (a private put is
   refused). So every blob gets a random suffix, making its URL unguessable,
   and URLs are only handed out after an access check. Before a real
   rollout, move to a private store and serve through signed downloads. */
export const BLOB_ACCESS = "public" as const;

type PutBody = Parameters<typeof put>[1];

export async function putBlob(
  pathname: string,
  body: PutBody,
  opts: { contentType: string; overwrite?: boolean; multipart?: boolean },
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: BLOB_ACCESS,
    contentType: opts.contentType,
    // Large files (the faststart remux) upload in parts.
    multipart: opts.multipart ?? false,
    // Overwrite keeps an existing (already unguessable) pathname, e.g. the
    // faststart remux replacing source.mp4. New files get a random suffix.
    addRandomSuffix: !opts.overwrite,
    allowOverwrite: Boolean(opts.overwrite),
  });
}

/* Demo lecture files are shared by every seeded database and are never
   deleted here, even when the seeded lesson's video is replaced. */
export async function deleteBlobs(urls: string[]): Promise<void> {
  const deletable = urls.filter((u) => !isDemoLectureUrl(u));
  if (deletable.length > 0) await del(deletable);
}

/* Metadata for a blob in our store, or null if it doesn't exist. */
export async function headBlob(url: string): Promise<HeadBlobResult | null> {
  try {
    return await head(url);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

/* Called when a browser upload finishes: by Blob's onUploadCompleted
   callback, and by the confirm action as the local-dev fallback (the
   callback can't reach localhost). Both may run, so it is idempotent.
   Kind-specific records (the videos row, feature 10) hook in here. */
export async function recordUpload(
  token: TokenPayload,
  blob: { url: string; pathname: string; contentType?: string; size?: number },
): Promise<void> {
  const [seen] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.action, "blob.upload"), eq(auditLog.entityId, blob.pathname)))
    .limit(1);
  if (!seen) {
    await auditInsert({
      actorId: token.userId,
      action: "blob.upload",
      entityType: token.kind,
      entityId: blob.pathname,
      data: { url: blob.url, contentType: blob.contentType ?? null, size: blob.size ?? null },
    });
  }

  const p = token.payload;
  switch (p.kind) {
    case "lesson-video":
      // Idempotent: only an `uploading` row starts a run.
      await startVideoProcessing({ videoId: p.videoId, lessonId: p.lessonId, userId: token.userId, blob });
      break;
    case "dev-test":
      break;
    default: {
      const never: never = p;
      throw new Error(`Unhandled upload kind ${JSON.stringify(never)}`);
    }
  }
}

/* Real lookups for authorizeUpload(): course staff checked in SQL. */
export const uploadDeps: UploadDeps = {
  isLessonStaff: async (lessonId, viewer) => {
    const courseId = await courseIdForLesson(lessonId);
    return courseId !== null && (await getCourseAccess(courseId, viewer)) === "staff";
  },
};
