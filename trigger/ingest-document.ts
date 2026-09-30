import { idempotencyKeys, queue, schemaTask } from "@trigger.dev/sdk";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getDocument, saveExtracted } from "@/lib/db/documents";
import { loadDraftSource } from "@/lib/db/lesson-content";
import { documents } from "@/lib/db/schema";
import { syncNoteTitle } from "@/lib/db/space";
import { generateCardsTask, generateNotesTask, generateQuizTask } from "./generate-lesson-content";
import { indexLesson } from "./index-lesson";
import { indexNoteTask } from "./index-note";
import { extractDocument } from "./lib/ingest-document";
import { jobHooks, JobError, reportProgress, userFacingError } from "./lib/job-progress";

/* Feature 18: a document added to a lesson.
   1. Extract its text and citable parts (trigger/lib/ingest-document.ts)
      and mark it ready. Skipped when it's already ready, so a retry
      doesn't pay for Whisper twice.
   2. On a reading lesson (no video), redraft notes, cards and quiz from
      all of its documents (document mode). On other lessons documents are
      resources, so there's nothing to draft.
   3. Index the lesson, which the assistant then cites by page, section
      or time. An unpublished lesson is skipped until Publish.
   Feature 19: a student's own upload (ownerId set, no course) becomes
   their private note instead — see makePrivateNote below.
   A failure before step 1 finishes marks the document failed; later
   failures leave it ready and say where to retry. */

const documentIngest = queue({ name: "document-ingest", concurrencyLimit: 3 });

export const ingestDocumentPayload = z.object({ documentId: z.uuid() });

type Step = { ok: true } | { ok: false; error: unknown };

export const ingestDocumentTask = schemaTask({
  id: "ingest-document",
  schema: ingestDocumentPayload,
  queue: documentIngest,
  retry: { maxAttempts: 1 }, // the instructor retries from the editor
  maxDuration: 3600,
  ...jobHooks,
  onFailure: async ({ ctx, error, payload }) => {
    await jobHooks.onFailure({ ctx, error });
    await db
      .update(documents)
      .set({ status: "failed", error: userFacingError(error) })
      .where(and(eq(documents.id, payload.documentId), ne(documents.status, "ready")));
  },
  run: async ({ documentId }, { ctx }) => {
    const runId = ctx.run.id;
    const doc = await getDocument(documentId);
    if (!doc || !(doc.lessonId || (doc.noteId && doc.ownerId))) throw new JobError("This document no longer exists.");

    if (doc.status !== "ready") {
      await db.update(documents).set({ status: "processing", error: null }).where(eq(documents.id, documentId));
      const extracted = await extractDocument(doc, (stage, fraction, message) =>
        reportProgress(runId, { stage, progress: Math.round(stage === "read" ? 5 + 20 * fraction : 25 + 35 * fraction), message }),
      );
      await saveExtracted(documentId, extracted);
    }

    if (doc.noteId && doc.ownerId) return makePrivateNote(doc.noteId, doc.ownerId, runId);
    const lessonId = doc.lessonId!;

    const source = await loadDraftSource(lessonId);
    if (source?.mode === "document") {
      const content = { lessonId, parentRunId: runId, force: true };
      // Keyed per document, so a re-run of this task doesn't redraft twice.
      const key = (kind: string) => ({ idempotencyKey: `document:${documentId}:${kind}` });
      const drafts: [string, () => Promise<Step>][] = [
        ["the notes", () => generateNotesTask.triggerAndWait(content, key("notes"))],
        ["the flashcards", () => generateCardsTask.triggerAndWait(content, key("cards"))],
        ["the quiz", () => generateQuizTask.triggerAndWait(content, key("quiz"))],
      ];
      for (const [label, run] of drafts) {
        const result = await run();
        if (!result.ok) throw new JobError(`The document is ready, but drafting ${label} stopped. Open the review screen to try again.`);
      }
    }

    await reportProgress(runId, { stage: "index", progress: 99, message: "Indexing for the assistant…" });
    // Charged to whoever added the document (feature 25), like its reading.
    const indexed = await indexLesson.triggerAndWait({ lessonId, requestedBy: doc.createdBy ?? undefined });
    if (!indexed.ok) throw new JobError("The document is ready, but indexing it for the assistant failed. Publish the lesson again to retry.");
    await reportProgress(runId, {
      stage: "index",
      progress: 100,
      message: source?.mode === "document" ? "Drafts ready to review." : "Ready. Students see it once the lesson is published.",
    });
    return { drafted: source?.mode === "document" };
  },
});

/* Feature 19: the upload's text is in; now the student's note is written
   from it. The same drafting tasks run in document mode for the note, and
   save published (there's no review step for your own notes); then the
   note is indexed for the owner's chat. Every child run carries the owner
   as its concurrency key, so a student's uploads wait behind each other,
   not in front of everyone else's. Keys are scoped to this run: a retry
   starts a new run, and each step skips what an earlier one saved. */
async function makePrivateNote(noteId: string, ownerId: string, runId: string) {
  await syncNoteTitle(noteId);
  const content = { noteId, parentRunId: runId };
  const opts = async (kind: string) => ({ idempotencyKey: await idempotencyKeys.create(`note:${noteId}:${kind}`), concurrencyKey: ownerId });
  const drafts: [string, () => Promise<Step>][] = [
    ["your notes", async () => generateNotesTask.triggerAndWait(content, await opts("notes"))],
    ["the flashcards", async () => generateCardsTask.triggerAndWait(content, await opts("cards"))],
    ["the quiz", async () => generateQuizTask.triggerAndWait(content, await opts("quiz"))],
  ];
  for (const [label, run] of drafts) {
    const result = await run();
    if (!result.ok) throw new JobError(`Your file was read, but writing ${label} stopped. Try again.`);
  }

  await reportProgress(runId, { stage: "index", progress: 99, message: "Getting it ready for your questions…" });
  const indexed = await indexNoteTask.triggerAndWait({ noteId }, await opts("index"));
  if (!indexed.ok) throw new JobError("Your note is written, but getting it ready for questions failed. Try again.");
  await reportProgress(runId, { stage: "index", progress: 100, message: "Your note is ready." });
  return { drafted: true };
}
