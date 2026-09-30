import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import type { DocPart } from "@/lib/ai/types";
import { db } from "./client";
import { getLessonForUser, type Viewer } from "./courses";
import { documents, type DocumentKind, type DocumentRow, type DocumentStatus } from "./schema";

/* Lesson documents (feature 18). Writes come from the lesson editor's
   actions (course staff checked there) and the ingest-document task.
   Reads for people go through getDocumentForViewer / lessonDocuments,
   which only answer after the lesson itself is visible to the viewer. */

export async function createDocument(input: {
  lessonId: string;
  kind: DocumentKind;
  title: string;
  status: DocumentStatus;
  createdBy: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  url?: string;
  pathname?: string;
}): Promise<DocumentRow> {
  const [row] = await db.insert(documents).values(input).returning();
  return row;
}

export async function getDocument(documentId: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return row ?? null;
}

export async function updateDocument(
  documentId: string,
  fields: Partial<Pick<DocumentRow, "status" | "error" | "blobUrl" | "pathname" | "sizeBytes" | "contentType" | "title" | "text" | "parts" | "pageCount" | "durationSec" | "url">>,
): Promise<void> {
  await db.update(documents).set(fields).where(eq(documents.id, documentId));
}

/* What the ingest task saves, all at once. */
export async function saveExtracted(
  documentId: string,
  extracted: { title?: string; text: string; parts: DocPart[]; pageCount?: number | null; durationSec?: number | null },
): Promise<void> {
  await db
    .update(documents)
    .set({
      ...(extracted.title ? { title: extracted.title.slice(0, 160) } : {}),
      text: extracted.text,
      parts: extracted.parts,
      pageCount: extracted.pageCount ?? null,
      durationSec: extracted.durationSec ?? null,
      status: "ready",
      error: null,
    })
    .where(eq(documents.id, documentId));
}

/* A lesson's ready documents with their text: the source for drafting
   and indexing. Oldest first, so notes follow the order they were added. */
export async function readyLessonDocuments(lessonId: string) {
  return db
    .select({ id: documents.id, kind: documents.kind, title: documents.title, text: documents.text, parts: documents.parts })
    .from(documents)
    .where(and(eq(documents.lessonId, lessonId), eq(documents.status, "ready")))
    .orderBy(asc(documents.createdAt));
}

export interface DocumentSummary {
  id: string;
  kind: DocumentKind;
  title: string;
  filename: string | null;
  url: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  durationSec: number | null;
  status: DocumentStatus;
  error: string | null;
  hasFile: boolean;
  createdAt: Date;
}

const summaryColumns = {
  id: documents.id,
  kind: documents.kind,
  title: documents.title,
  filename: documents.filename,
  url: documents.url,
  sizeBytes: documents.sizeBytes,
  pageCount: documents.pageCount,
  durationSec: documents.durationSec,
  status: documents.status,
  error: documents.error,
  blobUrl: documents.blobUrl,
  createdAt: documents.createdAt,
};

/* The lesson's documents, without their text. Students get ready ones
   only. Call after getLessonForUser has let the viewer into the lesson. */
export function lessonDocumentsQuery(lessonId: string, opts: { readyOnly: boolean }) {
  return db
    .select(summaryColumns)
    .from(documents)
    .where(and(eq(documents.lessonId, lessonId), opts.readyOnly ? eq(documents.status, "ready") : undefined))
    .orderBy(asc(documents.createdAt));
}

export function toDocumentSummaries(rows: Awaited<ReturnType<typeof lessonDocumentsQuery>>): DocumentSummary[] {
  return rows.map(({ blobUrl, ...r }) => ({ ...r, hasFile: Boolean(blobUrl) }));
}

export async function lessonDocuments(lessonId: string, opts: { readyOnly: boolean }): Promise<DocumentSummary[]> {
  return toDocumentSummaries(await lessonDocumentsQuery(lessonId, opts));
}

/* The document, if this viewer may open it: its owner, or anyone who can
   open its lesson (students only once it's ready). */
export async function getDocumentForViewer(documentId: string, viewer: Viewer): Promise<DocumentRow | null> {
  const doc = await getDocument(documentId);
  if (!doc) return null;
  if (doc.ownerId) return doc.ownerId === viewer.id ? doc : null;
  if (!doc.lessonId) return null;
  const lesson = await getLessonForUser(doc.lessonId, viewer);
  if (!lesson) return null;
  if (lesson.access === "student" && doc.status !== "ready") return null;
  return doc;
}

/* Scoped to the lesson, so an id from another lesson deletes nothing. */
export async function deleteLessonDocument(lessonId: string, documentId: string): Promise<DocumentRow | null> {
  const [row] = await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.lessonId, lessonId)))
    .returning();
  return row ?? null;
}

export async function hasReadyDocuments(lessonId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.lessonId, lessonId), eq(documents.status, "ready")))
    .limit(1);
  return Boolean(row);
}

/* Anything still being read, for the editor's "Processing" state. */
export async function hasPendingDocuments(lessonId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.lessonId, lessonId), ne(documents.status, "ready"), ne(documents.status, "failed")))
    .limit(1);
  return Boolean(row);
}
