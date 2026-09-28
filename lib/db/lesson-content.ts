import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { PROMPTS_VERSION } from "@/lib/ai/prompts";
import type { Block } from "@/lib/ai/types";
import type { DraftChapter } from "@/lib/ai/generation/chapters";
import type { DraftCard, DraftQuestion, QuizLevel } from "@/lib/ai/generation/lesson";
import { db } from "./client";
import {
  chapters,
  flashcards,
  lessons,
  notes,
  quizQuestions,
  transcriptSegments,
  videos,
  type Chapter,
  type FlashcardRow,
  type LessonNoteDoc,
  type QuizQuestionRow,
} from "./schema";

/* AI lesson content (feature 12): chapters, the lesson note, flashcards and
   quiz questions. Generated drafts replace the lesson's previous drafts of
   the same kind in one batch. Callers check access: the tasks run as the
   system, the review actions check course staff, and the player only asks
   after getLessonForUser has passed. */

/* ---- Source for generation ------------------------------------------------ */

export interface LessonSource {
  lessonId: string;
  lessonTitle: string;
  videoId: string;
  durationSec: number;
  createdBy: string | null;
  segments: { startSec: number; endSec: number; text: string }[];
}

/* The live (newest ready) video and its transcript. */
export async function loadLessonSource(lessonId: string): Promise<LessonSource | null> {
  const [row] = await db
    .select({ videoId: videos.id, durationSec: videos.durationSec, createdBy: videos.createdBy, title: lessons.title })
    .from(videos)
    .innerJoin(lessons, eq(lessons.id, videos.lessonId))
    .where(and(eq(videos.lessonId, lessonId), eq(videos.status, "ready")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  if (!row) return null;
  const segments = await db
    .select({ startSec: transcriptSegments.startSec, endSec: transcriptSegments.endSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, row.videoId))
    .orderBy(asc(transcriptSegments.idx));
  return {
    lessonId,
    lessonTitle: row.title,
    videoId: row.videoId,
    durationSec: row.durationSec ?? segments.at(-1)?.startSec ?? 0,
    createdBy: row.createdBy,
    segments,
  };
}

/* ---- Idempotency: was this kind already drafted from this video? ---------- */

export type ContentKind = "chapters" | "notes" | "cards" | "quiz";

export async function hasContentFor(kind: ContentKind, lessonId: string, videoId: string, level?: QuizLevel): Promise<boolean> {
  const table = { chapters, notes, cards: flashcards, quiz: quizQuestions }[kind];
  const where = [eq(table.lessonId, lessonId), eq(table.videoId, videoId)];
  if (kind === "quiz" && level) where.push(eq(quizQuestions.difficulty, level));
  const [row] = await db.select({ id: table.id }).from(table).where(and(...where)).limit(1);
  return Boolean(row);
}

/* ---- Writing drafts -------------------------------------------------------- */

export async function replaceChapters(lessonId: string, videoId: string, drafts: DraftChapter[]): Promise<void> {
  const insert = drafts.length
    ? [
        db.insert(chapters).values(
          drafts.map((c, position) => ({ lessonId, videoId, position, ...c, promptsVersion: PROMPTS_VERSION })),
        ),
      ]
    : [];
  await db.batch([db.delete(chapters).where(eq(chapters.lessonId, lessonId)), ...insert]);
}

export async function replaceLessonNote(input: { lessonId: string; videoId: string; title: string; blocks: Block[] }): Promise<void> {
  const values = { ...input, status: "draft" as const, promptsVersion: PROMPTS_VERSION };
  await db
    .insert(notes)
    .values(values)
    .onConflictDoUpdate({ target: notes.lessonId, set: { ...values, updatedAt: new Date() } });
}

export async function replaceCards(lessonId: string, videoId: string, noteId: string | null, drafts: DraftCard[]): Promise<void> {
  const insert = drafts.length
    ? [
        db.insert(flashcards).values(
          drafts.map((c, position) => ({ lessonId, videoId, noteId, position, ...c, promptsVersion: PROMPTS_VERSION })),
        ),
      ]
    : [];
  await db.batch([db.delete(flashcards).where(eq(flashcards.lessonId, lessonId)), ...insert]);
}

/* One difficulty level at a time, so a quiz run resumes where it stopped. */
export async function replaceQuizLevel(
  lessonId: string,
  videoId: string,
  noteId: string | null,
  level: QuizLevel,
  drafts: DraftQuestion[],
): Promise<void> {
  const insert = drafts.length
    ? [
        db.insert(quizQuestions).values(
          drafts.map((q, position) => ({ lessonId, videoId, noteId, position, ...q, promptsVersion: PROMPTS_VERSION })),
        ),
      ]
    : [];
  await db.batch([
    db.delete(quizQuestions).where(and(eq(quizQuestions.lessonId, lessonId), eq(quizQuestions.difficulty, level))),
    ...insert,
  ]);
}

/* ---- Reading --------------------------------------------------------------- */

export interface LessonContent {
  chapters: Chapter[];
  note: LessonNoteDoc | null;
  cards: FlashcardRow[];
  questions: QuizQuestionRow[];
}

const LEVEL_ORDER = sql`case ${quizQuestions.difficulty} when 'basic' then 0 when 'intermediate' then 1 else 2 end`;

/* Everything for the review screen (staff: drafts included), or only what
   students may see (`publishedOnly`). */
export async function getLessonContent(lessonId: string, opts: { publishedOnly: boolean }): Promise<LessonContent> {
  const published = <T extends typeof notes | typeof flashcards | typeof quizQuestions>(t: T) =>
    opts.publishedOnly ? eq(t.status, "published") : undefined;
  const [chapterRows, noteRows, cardRows, questionRows] = await db.batch([
    db.select().from(chapters).where(eq(chapters.lessonId, lessonId)).orderBy(asc(chapters.startSec), asc(chapters.position)),
    db.select().from(notes).where(and(eq(notes.lessonId, lessonId), published(notes))).limit(1),
    db.select().from(flashcards).where(and(eq(flashcards.lessonId, lessonId), published(flashcards))).orderBy(asc(flashcards.position)),
    db
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.lessonId, lessonId), published(quizQuestions)))
      .orderBy(LEVEL_ORDER, asc(quizQuestions.position)),
  ]);
  return { chapters: chapterRows, note: noteRows[0] ?? null, cards: cardRows, questions: questionRows };
}

/* The lesson note for the player: published only, unless staff preview. */
export async function getPlayerNote(lessonId: string, opts: { publishedOnly: boolean }): Promise<Block[] | null> {
  const [row] = await db
    .select({ blocks: notes.blocks })
    .from(notes)
    .where(and(eq(notes.lessonId, lessonId), opts.publishedOnly ? eq(notes.status, "published") : undefined))
    .limit(1);
  return row && row.blocks.length > 0 ? row.blocks : null;
}

/* Chapters for the player; they follow the lesson's own visibility. */
export async function listChapters(lessonId: string): Promise<Pick<Chapter, "title" | "startSec">[]> {
  return db
    .select({ title: chapters.title, startSec: chapters.startSec })
    .from(chapters)
    .where(eq(chapters.lessonId, lessonId))
    .orderBy(asc(chapters.startSec));
}

/* ---- Instructor edits (review screen). Each is scoped to the lesson, so an
   id from another lesson matches nothing. Returns false when nothing matched. */

export async function updateChapter(lessonId: string, id: string, fields: { title: string; startSec: number; summary: string }) {
  const rows = await db
    .update(chapters)
    .set(fields)
    .where(and(eq(chapters.id, id), eq(chapters.lessonId, lessonId)))
    .returning({ id: chapters.id });
  return rows.length > 0;
}

export async function addChapter(lessonId: string, fields: { title: string; startSec: number; summary: string }) {
  const [row] = await db
    .insert(chapters)
    .values({
      lessonId,
      ...fields,
      position: sql`(select coalesce(max(position), -1) + 1 from chapters where lesson_id = ${lessonId})`,
      promptsVersion: PROMPTS_VERSION,
    })
    .returning();
  return row;
}

export async function deleteChapter(lessonId: string, id: string) {
  const rows = await db
    .delete(chapters)
    .where(and(eq(chapters.id, id), eq(chapters.lessonId, lessonId)))
    .returning({ id: chapters.id });
  return rows.length > 0;
}

/* Saving an edited note keeps its publish status: fixing a typo in
   published notes doesn't take them away from students. */
export async function updateNoteBlocks(lessonId: string, blocks: Block[]) {
  const rows = await db
    .update(notes)
    .set({ blocks, updatedAt: new Date() })
    .where(eq(notes.lessonId, lessonId))
    .returning({ id: notes.id });
  return rows.length > 0;
}

export async function updateCard(lessonId: string, id: string, fields: { front: string; back: string; topic: string }) {
  const rows = await db
    .update(flashcards)
    .set(fields)
    .where(and(eq(flashcards.id, id), eq(flashcards.lessonId, lessonId)))
    .returning({ id: flashcards.id });
  return rows.length > 0;
}

export async function addCard(lessonId: string, fields: { front: string; back: string; topic: string }) {
  const [note] = await db.select({ id: notes.id }).from(notes).where(eq(notes.lessonId, lessonId)).limit(1);
  const [row] = await db
    .insert(flashcards)
    .values({
      lessonId,
      noteId: note?.id ?? null,
      ...fields,
      position: sql`(select coalesce(max(position), -1) + 1 from flashcards where lesson_id = ${lessonId})`,
      promptsVersion: PROMPTS_VERSION,
    })
    .returning();
  return row;
}

export async function deleteCard(lessonId: string, id: string) {
  const rows = await db
    .delete(flashcards)
    .where(and(eq(flashcards.id, id), eq(flashcards.lessonId, lessonId)))
    .returning({ id: flashcards.id });
  return rows.length > 0;
}

export async function updateQuestion(
  lessonId: string,
  id: string,
  fields: Pick<QuizQuestionRow, "question" | "options" | "correctIndex" | "explanation" | "topic" | "bank" | "difficulty">,
) {
  const rows = await db
    .update(quizQuestions)
    .set(fields)
    .where(and(eq(quizQuestions.id, id), eq(quizQuestions.lessonId, lessonId)))
    .returning({ id: quizQuestions.id });
  return rows.length > 0;
}

export async function deleteQuestion(lessonId: string, id: string) {
  const rows = await db
    .delete(quizQuestions)
    .where(and(eq(quizQuestions.id, id), eq(quizQuestions.lessonId, lessonId)))
    .returning({ id: quizQuestions.id });
  return rows.length > 0;
}

/* ---- Publish --------------------------------------------------------------- */

/* The lesson and all its generated items go live together. Returns the
   statements so the caller can add its audit row to the same batch. */
export function publishLessonStatements(lessonId: string) {
  return [
    db
      .update(lessons)
      .set({ status: "published", publishedAt: sql`coalesce(${lessons.publishedAt}, now())` })
      .where(eq(lessons.id, lessonId)),
    db.update(notes).set({ status: "published" }).where(eq(notes.lessonId, lessonId)),
    db.update(flashcards).set({ status: "published" }).where(eq(flashcards.lessonId, lessonId)),
    db.update(quizQuestions).set({ status: "published" }).where(eq(quizQuestions.lessonId, lessonId)),
  ] as const;
}

/* Counts per kind for the lesson editor's "Review" card. */
export async function contentCounts(lessonId: string) {
  const [row] = await db
    .select({
      chapters: sql<number>`(select count(*) from chapters where lesson_id = ${lessonId})`.mapWith(Number),
      notes: sql<number>`(select count(*) from notes where lesson_id = ${lessonId})`.mapWith(Number),
      cards: sql<number>`(select count(*) from flashcards where lesson_id = ${lessonId})`.mapWith(Number),
      questions: sql<number>`(select count(*) from quiz_questions where lesson_id = ${lessonId})`.mapWith(Number),
      drafts: sql<number>`(select count(*) from notes where lesson_id = ${lessonId} and status = 'draft')
        + (select count(*) from flashcards where lesson_id = ${lessonId} and status = 'draft')
        + (select count(*) from quiz_questions where lesson_id = ${lessonId} and status = 'draft')`.mapWith(Number),
    })
    .from(sql`(select 1) as one`);
  return row;
}
