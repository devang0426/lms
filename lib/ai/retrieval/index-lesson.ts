import "server-only";

import { eq } from "drizzle-orm";
import { deleteLessonChunks, replaceLessonChunks, type NewLessonChunk } from "@/lib/db/chunks";
import { readyLessonDocuments } from "@/lib/db/documents";
import { db } from "@/lib/db/client";
import { courseIdForLesson } from "@/lib/db/courses";
import { listChapters, loadLessonSource } from "@/lib/db/lesson-content";
import { lessons } from "@/lib/db/schema";
import { chunkDocument } from "./chunk-document";
import { chunkTranscript } from "./chunk-transcript";
import { EMBEDDING_MODEL, embedPassages } from "./embed";

/* Index one lesson for the assistant (features 13 and 18): the live
   video's transcript, cut along its chapters, plus every ready document
   attached to the lesson, cut by page, section or time. Everything is
   embedded, then replaces the lesson's old chunks in one batch. Run by the
   index-lesson task on Publish and after a document is added, and by the
   seed for the demo lecture. A lesson that isn't published (any more) has
   its chunks removed instead. */

export { EMBEDDING_MODEL };

export type IndexResult =
  | { status: "indexed"; chunks: number; transcriptChunks: number; documentChunks: number; fromSec: number | null; toSec: number | null }
  | { status: "not_published" | "no_transcript"; chunks: 0 };

export async function indexLessonChunks(
  lessonId: string,
  opts: {
    report?: (fraction: number, message: string) => Promise<void>;
    /* Who published: charged for the embeddings (feature 25). Else the video's uploader. */
    requestedBy?: string;
  } = {},
): Promise<IndexResult> {
  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  const courseId = await courseIdForLesson(lessonId);
  if (lesson?.status !== "published" || !courseId) {
    await deleteLessonChunks(lessonId);
    return { status: "not_published", chunks: 0 };
  }

  const [src, docs] = await Promise.all([loadLessonSource(lessonId), readyLessonDocuments(lessonId)]);
  const transcript: Omit<NewLessonChunk, "embedding">[] = src
    ? chunkTranscript(src.segments, await listChapters(lessonId)).map((c) => ({
        kind: "video" as const,
        text: c.text,
        startSec: c.startSec,
        endSec: c.endSec,
      }))
    : [];
  const fromDocs: Omit<NewLessonChunk, "embedding">[] = docs.flatMap((d) =>
    chunkDocument(d.title, d.parts).map((c) => ({ kind: "doc" as const, documentId: d.id, ...c })),
  );
  const chunks = [...transcript, ...fromDocs];
  if (chunks.length === 0) {
    await deleteLessonChunks(lessonId);
    return { status: "no_transcript", chunks: 0 };
  }

  const embeddings = await embedPassages(
    chunks.map((c) => c.text),
    {
      feature: "lesson-index",
      userId: opts.requestedBy ?? src?.createdBy ?? null,
      failMessage: "The search model returned an unexpected answer, so the lesson wasn't indexed. Try publishing again.",
      report: opts.report,
    },
  );

  const written = await replaceLessonChunks({
    lessonId,
    courseId,
    model: EMBEDDING_MODEL,
    chunks: chunks.map((c, i) => ({ ...c, embedding: embeddings[i] })),
  });
  if (!written) return { status: "not_published", chunks: 0 };
  return {
    status: "indexed",
    chunks: chunks.length,
    transcriptChunks: transcript.length,
    documentChunks: fromDocs.length,
    fromSec: transcript[0]?.startSec ?? null,
    toSec: transcript.at(-1)?.endSec ?? null,
  };
}
