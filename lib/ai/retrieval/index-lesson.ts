import "server-only";

import { eq } from "drizzle-orm";
import { EngineError, OPENROUTER_DEFAULT_CHAINS } from "@/lib/ai/engine";
import { supportsTask, unsupportedMessage } from "@/lib/ai/engine/router";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import { deleteLessonChunks, replaceLessonChunks } from "@/lib/db/chunks";
import { db } from "@/lib/db/client";
import { courseIdForLesson } from "@/lib/db/courses";
import { listChapters, loadLessonSource } from "@/lib/db/lesson-content";
import { EMBEDDING_DIMENSIONS, lessons } from "@/lib/db/schema";
import { chunkTranscript } from "./chunk-transcript";

/* Index one lesson for the assistant (feature 13): cut the live video's
   transcript into chunks along its chapters, embed them, and replace the
   lesson's old chunks. Run by the index-lesson task on Publish, and by the
   seed for the demo lecture. A lesson that isn't published (any more) has
   its chunks removed instead. */

/* One model for every vector: vectors from different models can't be
   compared. Stored on each row. */
export const EMBEDDING_MODEL = OPENROUTER_DEFAULT_CHAINS.embeddings[0];
const EMBED_BATCH = 64;

export type IndexResult =
  | { status: "indexed"; chunks: number; fromSec: number; toSec: number }
  | { status: "not_published" | "no_transcript"; chunks: 0 };

export async function indexLessonChunks(
  lessonId: string,
  opts: { report?: (fraction: number, message: string) => Promise<void> } = {},
): Promise<IndexResult> {
  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  const courseId = await courseIdForLesson(lessonId);
  if (lesson?.status !== "published" || !courseId) {
    await deleteLessonChunks(lessonId);
    return { status: "not_published", chunks: 0 };
  }

  const src = await loadLessonSource(lessonId);
  const chunks = src ? chunkTranscript(src.segments, await listChapters(lessonId)) : [];
  if (!src || chunks.length === 0) {
    await deleteLessonChunks(lessonId);
    return { status: "no_transcript", chunks: 0 };
  }

  const engine = getEngine();
  if (!supportsTask(engine, "embeddings")) throw new EngineError(unsupportedMessage("embeddings"), "unsupported");
  const embeddings: number[][] = [];
  await withUsage("lesson-index", src.createdBy, async () => {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      await opts.report?.(i / chunks.length, `Indexing for the assistant: ${i} of ${chunks.length} passages…`);
      embeddings.push(...(await engine.embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.text))));
    }
  });
  if (embeddings.length !== chunks.length || embeddings.some((e) => e.length !== EMBEDDING_DIMENSIONS)) {
    throw new EngineError("The search model returned an unexpected answer, so the lesson wasn't indexed. Try publishing again.");
  }

  const written = await replaceLessonChunks({
    lessonId,
    courseId,
    model: EMBEDDING_MODEL,
    chunks: chunks.map((c, i) => ({ text: c.text, startSec: c.startSec, endSec: c.endSec, embedding: embeddings[i] })),
  });
  if (!written) return { status: "not_published", chunks: 0 };
  return { status: "indexed", chunks: chunks.length, fromSec: chunks[0].startSec, toSec: chunks.at(-1)!.endSec };
}
