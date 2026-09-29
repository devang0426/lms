import { getEngine } from "@/lib/ai/engine/server";
import { documentNotesSections, generateDocumentCards, generateDocumentNotes, generateDocumentQuiz } from "@/lib/ai/generation/document";
import { QUIZ_LEVELS } from "@/lib/ai/generation/lesson";
import { withUsage } from "@/lib/ai/usage";
import { hasNoteContent, loadNoteSource, replaceNoteCards, replaceNoteQuizLevel, saveNoteBlocks, type NoteDraftSource } from "@/lib/db/space";
import { JobError } from "./job-progress";
import type { StepOptions, StepResult } from "./lesson-content";

/* A private note's drafts (feature 19): notes, flashcards and a quiz from
   a student's own upload, in document mode (feature 18: notes from the
   document, cards and quiz from the notes' own sections, no video times).
   There's no review step for your own notes, so each is saved published,
   for the owner alone. A step skips what's already there unless `force`,
   so a retry picks up where a run stopped. The AI cost is logged to the
   owner under the space-* features. The generate-notes, -cards and -quiz
   tasks run these when given a noteId. */

async function source(noteId: string): Promise<NoteDraftSource> {
  const src = await loadNoteSource(noteId);
  if (!src) throw new JobError("This note no longer exists.");
  if (src.documents.length === 0) throw new JobError("This note's source hasn't been read yet, so there's nothing to write from.");
  return src;
}

function currentNotes(src: NoteDraftSource) {
  if (src.blocks.length === 0) throw new JobError("Write the notes first: the flashcards and quiz are made from them.");
  return documentNotesSections(src.blocks, src.title);
}

export async function draftNoteNotes(noteId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(noteId);
  if (!opts.force && src.blocks.length > 0) return { skipped: true, count: 0 };
  await opts.report?.(0, "Writing your notes…");
  const blocks = await withUsage("space-notes", src.ownerId, () => generateDocumentNotes(getEngine(), src.documents));
  await saveNoteBlocks(noteId, blocks);
  return { skipped: false, count: blocks.length };
}

export async function draftNoteCards(noteId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(noteId);
  if (!opts.force && (await hasNoteContent("cards", noteId))) return { skipped: true, count: 0 };
  const notes = currentNotes(src);
  await opts.report?.(0, "Writing flashcards…");
  const cards = await withUsage("space-cards", src.ownerId, () => generateDocumentCards(getEngine(), notes));
  await replaceNoteCards(noteId, cards);
  return { skipped: false, count: cards.length };
}

/* Three levels, eight questions each, saved level by level. */
export async function draftNoteQuiz(noteId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(noteId);
  let count = 0;
  let skipped = true;
  for (const [i, level] of QUIZ_LEVELS.entries()) {
    if (!opts.force && (await hasNoteContent("quiz", noteId, level))) continue;
    const notes = currentNotes(src);
    await opts.report?.(i / QUIZ_LEVELS.length, `Writing ${level} quiz questions…`);
    const questions = await withUsage("space-quiz", src.ownerId, () => generateDocumentQuiz(getEngine(), notes, level));
    await replaceNoteQuizLevel(noteId, level, questions);
    count += questions.length;
    skipped = false;
  }
  return { skipped, count };
}
