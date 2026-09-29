import "server-only";

import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lessonDocuments, type DocumentSummary } from "@/lib/db/documents";
import { documents, type DocumentRow, type Job } from "@/lib/db/schema";
import { getJobAccessToken, latestJobFor, startJob } from "@/lib/jobs";
import { TERMINAL_JOB_STATES } from "@/lib/jobs/stages";

/* Lesson documents, web side (feature 18). The browser uploads files
   straight to Blob and links are typed in; these start the ingest-document
   task and read the state back for the lesson editor. Callers check
   course staff (or, for a student's private upload in feature 19, that
   it's theirs). The work runs in trigger/ingest-document.ts. */

export const documentEntity = (documentId: string) => ({ type: "document", id: documentId });

/* An uploaded file has landed: record it and start reading it. Runs from
   Blob's completion callback and from the local-dev confirm action, so it
   is idempotent — only an `uploading` row moves on, and the job key is per
   document, so a second call reuses the same run. */
export async function startDocumentIngest(input: {
  documentId: string;
  lessonId: string;
  userId: string;
  blob: { url: string; pathname: string; size?: number };
}): Promise<void> {
  if (!(await markUploaded(input.documentId, eq(documents.lessonId, input.lessonId), input.blob))) return;
  await startIngestRun(input.documentId, input.userId, "ingest", null);
}

/* The same for a student's own upload (feature 19): only their own
   document moves on, and its run goes in their own copy of the queue. */
export async function startPrivateDocumentIngest(input: {
  documentId: string;
  userId: string;
  blob: { url: string; pathname: string; size?: number };
}): Promise<void> {
  if (!(await markUploaded(input.documentId, eq(documents.ownerId, input.userId), input.blob))) return;
  await startIngestRun(input.documentId, input.userId, "ingest", input.userId);
}

async function markUploaded(documentId: string, scope: SQL, blob: { url: string; pathname: string; size?: number }): Promise<boolean> {
  const [moved] = await db
    .update(documents)
    .set({ blobUrl: blob.url, pathname: blob.pathname, sizeBytes: blob.size ?? null, status: "processing", error: null })
    .where(and(eq(documents.id, documentId), scope, eq(documents.status, "uploading")))
    .returning({ id: documents.id });
  return Boolean(moved);
}

/* A link document (web page or YouTube) is ready to fetch as soon as it's saved. */
export async function startLinkIngest(doc: DocumentRow, userId: string): Promise<void> {
  await startIngestRun(doc.id, userId, "ingest", doc.ownerId);
}

/* A fresh run for a document whose ingest failed. Extraction is skipped
   if it had already finished; drafting and indexing run again. */
export async function retryDocumentIngest(doc: DocumentRow, userId: string): Promise<void> {
  if (doc.status === "failed") await db.update(documents).set({ status: "processing", error: null }).where(eq(documents.id, doc.id));
  await startIngestRun(doc.id, userId, `retry:${Date.now()}`, doc.ownerId);
}

/* `ownerId` is set for a student's own upload (feature 19): its run is
   keyed to them, so one student can't hold up the queue for everyone. */
async function startIngestRun(documentId: string, userId: string, key: string, ownerId: string | null): Promise<void> {
  try {
    await startJob({
      kind: "ingest-document",
      entity: documentEntity(documentId),
      payload: { documentId },
      createdBy: userId,
      idempotencyKey: `document:${documentId}:${key}`,
      concurrencyKey: ownerId ?? undefined,
    });
  } catch (err) {
    console.error(`[ingest-document] couldn't start document ${documentId}`, err);
    await db
      .update(documents)
      .set({ status: "failed", error: "Reading this document couldn't be started. Try again in a minute." })
      .where(eq(documents.id, documentId));
  }
}

export interface EditorDocument extends DocumentSummary {
  /* The latest run, while it's going or when it failed after the
     document became ready (drafting or indexing). */
  job: { job: Job; token: string } | null;
}

/* The lesson editor's documents list, each with its live run. */
export async function documentsForEditor(lessonId: string): Promise<EditorDocument[]> {
  const docs = await lessonDocuments(lessonId, { readyOnly: false });
  return Promise.all(
    docs.map(async (doc) => {
      const latest = await latestJobFor(documentEntity(doc.id), "ingest-document");
      const active = latest && !TERMINAL_JOB_STATES.includes(latest.status);
      const failedLater = latest?.status === "failed" && doc.status === "ready";
      // A run that died before its task started never marked the document failed.
      if (latest && TERMINAL_JOB_STATES.includes(latest.status) && latest.status !== "completed" && doc.status === "processing") {
        const error = latest.error ?? "Reading this document stopped. Try again.";
        await db.update(documents).set({ status: "failed", error }).where(eq(documents.id, doc.id));
        return { ...doc, status: "failed" as const, error, job: null };
      }
      return { ...doc, job: latest && (active || failedLater) ? { job: latest, token: await getJobAccessToken(latest) } : null };
    }),
  );
}
