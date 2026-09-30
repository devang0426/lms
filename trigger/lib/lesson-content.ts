import { getEngine } from "@/lib/ai/engine/server";
import { generateChapters, type DraftChapter } from "@/lib/ai/generation/chapters";
import { generateLectureNotes, generateLessonCards, generateLessonQuiz, lectureNotesText, QUIZ_LEVELS } from "@/lib/ai/generation/lesson";
import { generateDocumentCards, generateDocumentNotes, generateDocumentQuiz, documentNotesSections } from "@/lib/ai/generation/document";
import { withUsage } from "@/lib/ai/usage";
import {
  getLessonContent,
  hasContentFor,
  loadDraftSource,
  replaceCards,
  replaceChapters,
  replaceLessonNote,
  replaceQuizLevel,
  type DraftSource,
} from "@/lib/db/lesson-content";
import { JobError } from "./job-progress";

/* Pipeline steps 8–10 (feature 12). Each step drafts one kind of content
   for the lesson's live video and saves it before returning, so a re-run
   skips what's done. `force` (regenerate from the review screen) redrafts
   even when this video already has content. A reading lesson with no
   video drafts from its documents instead (document mode, feature 18):
   no chapters, notes from the documents, cards and quiz from the notes.
   Tasks in trigger/generate-lesson-content.ts wrap these. */

export type Report = (progress: number, message: string) => Promise<void>;
export interface StepOptions {
  force?: boolean;
  report?: Report;
  /* Charged for the AI calls instead of the source's uploader (a regenerate). */
  requestedBy?: string;
}
export type StepResult = { skipped: boolean; count: number };

async function source(lessonId: string): Promise<DraftSource> {
  const src = await loadDraftSource(lessonId);
  if (!src) {
    throw new JobError(
      "This lesson has nothing to draft from yet: upload and process its video, or, for a reading lesson, add a document.",
    );
  }
  return src;
}

async function currentChapters(lessonId: string): Promise<DraftChapter[]> {
  const { chapters } = await getLessonContent(lessonId, { publishedOnly: false });
  if (chapters.length === 0) throw new JobError("Draft the chapters first: notes, cards and quizzes are built on them.");
  return chapters.map((c) => ({ title: c.title, startSec: c.startSec, summary: c.summary }));
}

/* The notes as numbered sections for the card and quiz prompts: the
   video's chapters, or (document mode) the notes' own headings. */
async function currentNotes(src: DraftSource) {
  const { note } = await getLessonContent(src.lessonId, { publishedOnly: false });
  if (!note || note.blocks.length === 0) throw new JobError("Draft the notes first: cards and quizzes are built from them.");
  if (src.mode === "document") return { noteId: note.id, ...documentNotesSections(note.blocks, src.lessonTitle) };
  const chapters = await currentChapters(src.lessonId);
  return { noteId: note.id, text: lectureNotesText(note.blocks, chapters), chapters };
}

export async function draftChapters(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  // Documents have pages and sections, not chapters in time.
  if (src.mode === "document") return { skipped: true, count: 0 };
  if (!opts.force && (await hasContentFor("chapters", lessonId, src.videoId))) return { skipped: true, count: 0 };
  await opts.report?.(0, "Finding where each topic starts…");
  const drafts = await withUsage("lesson-chapters", opts.requestedBy ?? src.createdBy, () =>
    generateChapters(getEngine(), src.segments, { durationSec: src.durationSec }),
  );
  await replaceChapters(lessonId, src.videoId, drafts);
  return { skipped: false, count: drafts.length };
}

export async function draftNotes(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  if (!opts.force && (await hasContentFor("notes", lessonId, src.videoId))) return { skipped: true, count: 0 };
  let blocks;
  if (src.mode === "document") {
    await opts.report?.(0, `Writing notes from ${src.documents.length === 1 ? "the document" : `${src.documents.length} documents`}…`);
    blocks = await withUsage("lesson-notes", opts.requestedBy ?? src.createdBy, () => generateDocumentNotes(getEngine(), src.documents));
  } else {
    const chapters = await currentChapters(lessonId);
    blocks = await withUsage("lesson-notes", opts.requestedBy ?? src.createdBy, () =>
      generateLectureNotes(getEngine(), src.segments, chapters, {
        onSection: (done, total) => opts.report?.(done / (total + 1), `Writing notes: chapter ${done} of ${total}…`),
      }),
    );
  }
  await replaceLessonNote({ lessonId, videoId: src.videoId, title: src.lessonTitle, blocks });
  return { skipped: false, count: blocks.length };
}

export async function draftCards(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  if (!opts.force && (await hasContentFor("cards", lessonId, src.videoId))) return { skipped: true, count: 0 };
  const notes = await currentNotes(src);
  await opts.report?.(0, "Writing flashcards…");
  const cards = await withUsage("lesson-cards", opts.requestedBy ?? src.createdBy, () =>
    src.mode === "document" ? generateDocumentCards(getEngine(), notes) : generateLessonCards(getEngine(), notes.text, notes.chapters),
  );
  await replaceCards(lessonId, src.videoId, notes.noteId, cards);
  return { skipped: false, count: cards.length };
}

/* Three levels, eight questions each, saved level by level. */
export async function draftQuiz(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  let notes: Awaited<ReturnType<typeof currentNotes>> | null = null;
  let count = 0;
  let skipped = true;
  for (const [i, level] of QUIZ_LEVELS.entries()) {
    if (!opts.force && (await hasContentFor("quiz", lessonId, src.videoId, level))) continue;
    notes ??= await currentNotes(src);
    const n = notes;
    await opts.report?.(i / QUIZ_LEVELS.length, `Writing ${level} quiz questions…`);
    const questions = await withUsage("lesson-quiz", opts.requestedBy ?? src.createdBy, () =>
      src.mode === "document" ? generateDocumentQuiz(getEngine(), n, level) : generateLessonQuiz(getEngine(), n.text, n.chapters, level),
    );
    await replaceQuizLevel(lessonId, src.videoId, n.noteId, level, questions);
    count += questions.length;
    skipped = false;
  }
  return { skipped, count };
}
