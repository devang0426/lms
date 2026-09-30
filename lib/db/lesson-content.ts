import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { PROMPTS_VERSION } from "@/lib/ai/prompts";
import type { Block } from "@/lib/ai/types";
import type { DraftChapter } from "@/lib/ai/generation/chapters";
import type { DraftCard, DraftQuestion, QuizLevel } from "@/lib/ai/generation/lesson";
import { db, type BatchRows } from "./client";
import {
  chapters,
  documents,
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

/* The source a lesson's drafts come from (feature 18): the live video if
   it has one; otherwise, for a reading lesson, its ready documents. Other
   lessons' documents are resources only (indexed, not drafted). */
export type DraftSource =
  | ({ mode: "video" } & LessonSource)
  | { mode: "document"; lessonId: string; lessonTitle: string; videoId: null; createdBy: string | null; documents: { title: string; text: string }[] };

export async function loadDraftSource(lessonId: string): Promise<DraftSource | null> {
  const video = await loadLessonSource(lessonId);
  if (video && video.segments.length > 0) return { mode: "video", ...video };
  const [lesson] = await db.select({ kind: lessons.kind, title: lessons.title }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (lesson?.kind !== "reading") return null;
  const docs = await db
    .select({ title: documents.title, text: documents.text, createdBy: documents.createdBy })
    .from(documents)
    .where(and(eq(documents.lessonId, lessonId), eq(documents.status, "ready")))
    .orderBy(asc(documents.createdAt));
  const withText = docs.filter((d) => d.text.trim());
  if (withText.length === 0) return null;
  return {
    mode: "document",
    lessonId,
    lessonTitle: lesson.title,
    videoId: null,
    createdBy: withText.at(-1)!.createdBy,
    documents: withText.map((d) => ({ title: d.title, text: d.text })),
  };
}

/* Which source the lesson's drafts would come from, without loading it
   (the review page only needs to know; feature 29): "video" when the live
   video has transcript lines, "document" for a reading lesson with a ready
   document that has text, else null. Mirrors loadDraftSource. */
export function draftSourceModeQuery(lessonId: string) {
  return db.execute<{ mode: DraftSource["mode"] | null }>(sql`select case
    when exists (select 1 from transcript_segments ts where ts.video_id = (select v.id from videos v
      where v.lesson_id = ${lessonId} and v.status = 'ready' order by v.created_at desc limit 1)) then 'video'
    when exists (select 1 from lessons l where l.id = ${lessonId} and l.kind = 'reading')
      and exists (select 1 from documents d where d.lesson_id = ${lessonId} and d.status = 'ready' and d.text ~ '\\S') then 'document'
    end as mode`);
}

/* ---- Idempotency: was this kind already drafted from this video? ----------
   Document drafts have no video (videoId null); they are redrafted with
   `force` whenever a document is added. */

export type ContentKind = "chapters" | "notes" | "cards" | "quiz";

export async function hasContentFor(kind: ContentKind, lessonId: string, videoId: string | null, level?: QuizLevel): Promise<boolean> {
  const table = { chapters, notes, cards: flashcards, quiz: quizQuestions }[kind];
  const where = [eq(table.lessonId, lessonId), videoId === null ? isNull(table.videoId) : eq(table.videoId, videoId)];
  if (kind === "quiz" && level) where.push(eq(quizQuestions.difficulty, level));
  const [row] = await db.select({ id: table.id }).from(table).where(and(...where)).limit(1);
  return Boolean(row);
}

/* ---- Writing drafts -------------------------------------------------------- */

export async function replaceChapters(lessonId: string, videoId: string | null, drafts: DraftChapter[]): Promise<void> {
  const insert = drafts.length
    ? [
        db.insert(chapters).values(
          drafts.map((c, position) => ({ lessonId, videoId, position, ...c, promptsVersion: PROMPTS_VERSION })),
        ),
      ]
    : [];
  await db.batch([db.delete(chapters).where(eq(chapters.lessonId, lessonId)), ...insert]);
}

export async function replaceLessonNote(input: { lessonId: string; videoId: string | null; title: string; blocks: Block[] }): Promise<void> {
  const values = { ...input, status: "draft" as const, promptsVersion: PROMPTS_VERSION };
  await db
    .insert(notes)
    .values(values)
    .onConflictDoUpdate({ target: notes.lessonId, set: { ...values, updatedAt: new Date() } });
}

export async function replaceCards(lessonId: string, videoId: string | null, noteId: string | null, drafts: DraftCard[]): Promise<void> {
  const insert = drafts.length
    ? [
        db.insert(flashcards).values(
          drafts.map((c, position) => ({ lessonId, videoId, noteId, position, ...c, promptsVersion: PROMPTS_VERSION })),
        ),
      ]
    : [];
  await db.batch([db.delete(flashcards).where(eq(flashcards.lessonId, lessonId)), ...insert]);
}

/* One difficulty level at a time, so a quiz run resumes where it stopped.
   Only the practice bank is replaced: questions an instructor put in a
   graded quiz (feature 16) stay, with the students' answers to them. */
export async function replaceQuizLevel(
  lessonId: string,
  videoId: string | null,
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
    db
      .delete(quizQuestions)
      .where(and(eq(quizQuestions.lessonId, lessonId), eq(quizQuestions.difficulty, level), eq(quizQuestions.bank, "practice"))),
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
export function lessonContentQueries(lessonId: string, opts: { publishedOnly: boolean }) {
  const published = <T extends typeof notes | typeof flashcards | typeof quizQuestions>(t: T) =>
    opts.publishedOnly ? eq(t.status, "published") : undefined;
  return [
    db.select().from(chapters).where(eq(chapters.lessonId, lessonId)).orderBy(asc(chapters.startSec), asc(chapters.position)),
    db.select().from(notes).where(and(eq(notes.lessonId, lessonId), published(notes))).limit(1),
    db.select().from(flashcards).where(and(eq(flashcards.lessonId, lessonId), published(flashcards))).orderBy(asc(flashcards.position)),
    db
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.lessonId, lessonId), published(quizQuestions)))
      .orderBy(LEVEL_ORDER, asc(quizQuestions.position)),
  ] as const;
}

export function toLessonContent([chapterRows, noteRows, cardRows, questionRows]: BatchRows<ReturnType<typeof lessonContentQueries>>): LessonContent {
  return { chapters: [...chapterRows], note: noteRows[0] ?? null, cards: [...cardRows], questions: [...questionRows] };
}

export async function getLessonContent(lessonId: string, opts: { publishedOnly: boolean }): Promise<LessonContent> {
  return toLessonContent(await db.batch(lessonContentQueries(lessonId, opts)));
}

/* The lesson note for the player: published only, unless staff preview.
   A statement for the player's batch; toPlayerNote() takes its rows. */
export function playerNoteQuery(lessonId: string, opts: { publishedOnly: boolean }) {
  return db
    .select({ blocks: notes.blocks })
    .from(notes)
    .where(and(eq(notes.lessonId, lessonId), opts.publishedOnly ? eq(notes.status, "published") : undefined))
    .limit(1);
}

export function toPlayerNote([row]: readonly { blocks: Block[] }[]): Block[] | null {
  return row && row.blocks.length > 0 ? row.blocks : null;
}

/* Chapters for the player; they follow the lesson's own visibility. */
export function chaptersQuery(lessonId: string) {
  return db
    .select({ title: chapters.title, startSec: chapters.startSec })
    .from(chapters)
    .where(eq(chapters.lessonId, lessonId))
    .orderBy(asc(chapters.startSec));
}

export async function listChapters(lessonId: string): Promise<Pick<Chapter, "title" | "startSec">[]> {
  return chaptersQuery(lessonId);
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
export function contentCountsQuery(lessonId: string) {
  return db
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
}

export async function contentCounts(lessonId: string) {
  const [row] = await contentCountsQuery(lessonId);
  return row;
}
