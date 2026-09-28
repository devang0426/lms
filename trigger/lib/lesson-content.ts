import { getEngine } from "@/lib/ai/engine/server";
import { generateChapters, type DraftChapter } from "@/lib/ai/generation/chapters";
import { generateLectureNotes, generateLessonCards, generateLessonQuiz, lectureNotesText, QUIZ_LEVELS } from "@/lib/ai/generation/lesson";
import { withUsage } from "@/lib/ai/usage";
import {
  getLessonContent,
  hasContentFor,
  loadLessonSource,
  replaceCards,
  replaceChapters,
  replaceLessonNote,
  replaceQuizLevel,
  type LessonSource,
} from "@/lib/db/lesson-content";
import { JobError } from "./job-progress";

/* Pipeline steps 8–10 (feature 12). Each step drafts one kind of content
   for the lesson's live video and saves it before returning, so a re-run
   skips what's done. `force` (regenerate from the review screen) redrafts
   even when this video already has content. Tasks in
   trigger/generate-lesson-content.ts wrap these. */

export type Report = (progress: number, message: string) => Promise<void>;
export interface StepOptions {
  force?: boolean;
  report?: Report;
}
export type StepResult = { skipped: boolean; count: number };

async function source(lessonId: string): Promise<LessonSource> {
  const src = await loadLessonSource(lessonId);
  if (!src || src.segments.length === 0) {
    throw new JobError("This lesson has no transcribed video yet, so there's nothing to draft from.");
  }
  return src;
}

async function currentChapters(lessonId: string): Promise<DraftChapter[]> {
  const { chapters } = await getLessonContent(lessonId, { publishedOnly: false });
  if (chapters.length === 0) throw new JobError("Draft the chapters first: notes, cards and quizzes are built on them.");
  return chapters.map((c) => ({ title: c.title, startSec: c.startSec, summary: c.summary }));
}

async function currentNotes(lessonId: string, chapters: DraftChapter[]) {
  const { note } = await getLessonContent(lessonId, { publishedOnly: false });
  if (!note || note.blocks.length === 0) throw new JobError("Draft the notes first: cards and quizzes are built from them.");
  return { noteId: note.id, text: lectureNotesText(note.blocks, chapters) };
}

export async function draftChapters(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  if (!opts.force && (await hasContentFor("chapters", lessonId, src.videoId))) return { skipped: true, count: 0 };
  await opts.report?.(0, "Finding where each topic starts…");
  const drafts = await withUsage("lesson-chapters", src.createdBy, () =>
    generateChapters(getEngine(), src.segments, { durationSec: src.durationSec }),
  );
  await replaceChapters(lessonId, src.videoId, drafts);
  return { skipped: false, count: drafts.length };
}

export async function draftNotes(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  if (!opts.force && (await hasContentFor("notes", lessonId, src.videoId))) return { skipped: true, count: 0 };
  const chapters = await currentChapters(lessonId);
  const blocks = await withUsage("lesson-notes", src.createdBy, () =>
    generateLectureNotes(getEngine(), src.segments, chapters, {
      onSection: (done, total) => opts.report?.(done / (total + 1), `Writing notes: chapter ${done} of ${total}…`),
    }),
  );
  await replaceLessonNote({ lessonId, videoId: src.videoId, title: src.lessonTitle, blocks });
  return { skipped: false, count: blocks.length };
}

export async function draftCards(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  if (!opts.force && (await hasContentFor("cards", lessonId, src.videoId))) return { skipped: true, count: 0 };
  const chapters = await currentChapters(lessonId);
  const notes = await currentNotes(lessonId, chapters);
  await opts.report?.(0, "Writing flashcards…");
  const cards = await withUsage("lesson-cards", src.createdBy, () => generateLessonCards(getEngine(), notes.text, chapters));
  await replaceCards(lessonId, src.videoId, notes.noteId, cards);
  return { skipped: false, count: cards.length };
}

/* Three levels, eight questions each, saved level by level. */
export async function draftQuiz(lessonId: string, opts: StepOptions = {}): Promise<StepResult> {
  const src = await source(lessonId);
  const chapters = await currentChapters(lessonId);
  let notes: Awaited<ReturnType<typeof currentNotes>> | null = null;
  let count = 0;
  let skipped = true;
  for (const [i, level] of QUIZ_LEVELS.entries()) {
    if (!opts.force && (await hasContentFor("quiz", lessonId, src.videoId, level))) continue;
    notes ??= await currentNotes(lessonId, chapters);
    await opts.report?.(i / QUIZ_LEVELS.length, `Writing ${level} quiz questions…`);
    const questions = await withUsage("lesson-quiz", src.createdBy, () =>
      generateLessonQuiz(getEngine(), notes!.text, chapters, level),
    );
    await replaceQuizLevel(lessonId, src.videoId, notes.noteId, level, questions);
    count += questions.length;
    skipped = false;
  }
  return { skipped, count };
}
