/* Lecture notes, flashcards and quiz (feature 12). Notes are written one
   chapter at a time (fast tier, a few at once), each opening with a `##` heading that
   carries the chapter's startSec, then wrapped in an overview and key
   takeaways (strong tier, the note merge). Cards and quiz questions
   (strong) are drafted from the notes and tagged with their chapter, so
   they can link back into the video. */

import "server-only";

import { z } from "zod";
import type { Block, BlockType } from "@/lib/ai/types";
import { markdownToBlocks, plainText, stripFence } from "@/lib/markdown";
import type { Engine } from "../engine/types";
import {
  lectureOverviewSystem,
  lessonCardsSchema,
  lessonCardsSystem,
  lessonQuizSchema,
  lessonQuizSystem,
  noteSectionSystem,
  noteUser,
} from "../prompts";
import { STRUCTURED_MAX_TOKENS, type DraftChapter, type TimedSegment } from "./chapters";
import { capTokens } from "./chunk";
import { withOneRetry } from "./retry";

const SECTION_SOURCE_TOKENS = 6000;
const OVERVIEW_SOURCE_TOKENS = 12_000;
const STUDY_SOURCE_TOKENS = 12_000;
/* Room for a reasoning model to think and still answer (feature 05 note). */
const SECTION_MAX_TOKENS = 5000;
const OVERVIEW_MAX_TOKENS = 3000;

export const CARDS_MIN = 15;
export const QUESTIONS_PER_LEVEL = 8;
export const QUIZ_LEVELS = ["basic", "intermediate", "exam"] as const;
export type QuizLevel = (typeof QUIZ_LEVELS)[number];

/* ---- Notes ---------------------------------------------------------------- */

/* Chapter sections are independent, so a few are written at once; the
   engine backs off if the provider rate-limits. */
const SECTION_CONCURRENCY = 4;

/* Like Promise.all over `items`, with at most `limit` running at a time.
   Results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* What was said in chapter `i`: segments from its start to the next one's. */
export function chapterText(segments: readonly TimedSegment[], chapters: readonly DraftChapter[], i: number): string {
  const from = chapters[i].startSec;
  const to = chapters[i + 1]?.startSec ?? Infinity;
  return segments
    .filter((s) => s.startSec >= from && s.startSec < to)
    .map((s) => s.text.trim())
    .join(" ");
}

const HEADINGS: readonly BlockType[] = ["heading1", "heading2", "heading3"];

/* One chapter's blocks: exactly one `##` (the chapter title, tagged with
   its startSec) and nothing above `###` below it. */
export function shapeChapterSection(markdown: string, chapter: DraftChapter): Block[] {
  const blocks = markdownToBlocks(stripFence(markdown).trim());
  if (blocks[0] && HEADINGS.includes(blocks[0].type)) blocks.shift();
  for (const b of blocks) if (b.type === "heading1" || b.type === "heading2") b.type = "heading3";
  const [heading] = markdownToBlocks(`## ${chapter.title}`);
  return [{ ...heading, startSec: chapter.startSec }, ...blocks];
}

export async function generateLectureNotes(
  engine: Engine,
  segments: readonly TimedSegment[],
  chapters: readonly DraftChapter[],
  opts: { language?: string; onSection?: (done: number, total: number) => void | Promise<void> } = {},
): Promise<Block[]> {
  const language = opts.language ?? "English";
  let finished = 0;
  const sections = await mapLimit(chapters, SECTION_CONCURRENCY, async (chapter, i) => {
    const said = chapterText(segments, chapters, i);
    let md = chapter.summary;
    if (said.trim()) {
      md = await withOneRetry("notes", async () => {
        const out = await engine.complete({
          system: noteSectionSystem(language, { chapterTitle: chapter.title }),
          messages: [{ role: "user", content: noteUser(capTokens(said, SECTION_SOURCE_TOKENS)) }],
          tier: "fast",
          temperature: 0.4,
          maxTokens: SECTION_MAX_TOKENS,
        });
        if (!out.trim()) throw new Error("Empty note section.");
        return out;
      });
    }
    await opts.onSection?.(++finished, chapters.length);
    return shapeChapterSection(md, chapter);
  });
  const body = sections.flat();

  // The note merge: an overview on top and key takeaways at the end. The
  // chapter sections stay as written. Optional — without it the notes are
  // still complete.
  try {
    const overview = await engine.complete({
      system: lectureOverviewSystem(language),
      messages: [{ role: "user", content: capTokens(lectureNotesText(body, chapters), OVERVIEW_SOURCE_TOKENS) }],
      tier: "strong",
      temperature: 0.3,
      maxTokens: OVERVIEW_MAX_TOKENS,
    });
    const extra = markdownToBlocks(stripFence(overview).trim());
    const split = extra.findIndex((b) => HEADINGS.includes(b.type));
    const intro = (split < 0 ? extra : extra.slice(0, split)).filter((b) => !HEADINGS.includes(b.type));
    const takeaways = split < 0 ? [] : extra.slice(split).map((b) => (HEADINGS.includes(b.type) ? { ...b, type: "heading2" as const } : b));
    return [...intro, ...body, ...takeaways];
  } catch (err) {
    console.warn("[generation] lecture overview skipped", err);
    return body;
  }
}

/* The notes as "Chapter n: title" sections, for grounding cards and quiz.
   A chapter section starts at a `##` heading with a startSec. */
export function lectureNotesText(blocks: readonly Block[], chapters: readonly DraftChapter[]): string {
  const parts: string[] = [];
  let current: Block[] | null = null;
  let label = "";
  const flush = () => {
    if (current) parts.push(`${label}\n${plainText(current)}`);
  };
  for (const b of blocks) {
    if (b.type === "heading2" && b.startSec !== undefined) {
      flush();
      const n = chapterNumberAt(chapters, b.startSec);
      label = `Chapter ${n}: ${b.text}`;
      current = [];
    } else if (current) current.push(b);
  }
  flush();
  return parts.join("\n\n");
}

function chapterNumberAt(chapters: readonly DraftChapter[], startSec: number): number {
  const i = chapters.findIndex((c) => Math.abs(c.startSec - startSec) < 0.5);
  return i >= 0 ? i + 1 : 0;
}

/* Chapter number from the model (1-based) → that chapter's startSec. */
export function startForChapter(chapters: readonly DraftChapter[], n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= chapters.length ? chapters[n - 1].startSec : null;
}

/* ---- Flashcards ------------------------------------------------------------ */

export interface DraftCard {
  front: string;
  back: string;
  topic: string;
  startSec: number | null;
}

const cardsOutput = z.object({
  cards: z.array(
    z.object({
      front: z.string().trim().min(1).max(500),
      back: z.string().trim().min(1).max(1500),
      topic: z.string().max(80),
      chapter: z.number().int(),
    }),
  ),
});

export async function generateLessonCards(engine: Engine, notesText: string, chapters: readonly DraftChapter[]): Promise<DraftCard[]> {
  const content = capTokens(notesText, STUDY_SOURCE_TOKENS);
  return withOneRetry("flashcards", async () => {
    const raw = await engine.structured<unknown>({
      system: lessonCardsSystem(chapters.length),
      messages: [{ role: "user", content }],
      schema: lessonCardsSchema as unknown as Record<string, unknown>,
      schemaName: "lesson_cards",
      // Strong, like chapters: the fast chain was slow at structured output.
      tier: "strong",
      maxTokens: STRUCTURED_MAX_TOKENS,
    });
    const { cards } = cardsOutput.parse(raw);
    if (cards.length < CARDS_MIN) throw new Error(`Only ${cards.length} cards (need ${CARDS_MIN}).`);
    return cards.map((c) => ({ front: c.front, back: c.back, topic: c.topic.trim(), startSec: startForChapter(chapters, c.chapter) }));
  });
}

/* ---- Quiz ------------------------------------------------------------------ */

export interface DraftQuestion {
  type: "mcq" | "true_false" | "fill_blank";
  difficulty: QuizLevel;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  startSec: number | null;
}

const questionShape = z.object({
  type: z.enum(["mcq", "true_false", "fill_blank"]),
  topic: z.string().max(80),
  difficulty: z.string(),
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(500)),
  correctIndex: z.number().int(),
  explanation: z.string().max(1500),
  chapter: z.number().int(),
});

/* A question the student can actually answer: four options for mcq,
   True/False for true_false, one answer for fill_blank, and a correct
   index that points at an option. Anything else is dropped. */
export function isAnswerable(q: z.infer<typeof questionShape>): boolean {
  const inRange = q.correctIndex >= 0 && q.correctIndex < q.options.length;
  switch (q.type) {
    case "mcq":
      return q.options.length === 4 && new Set(q.options).size === 4 && inRange;
    case "true_false":
      return q.options.length === 2 && q.options[0] === "True" && q.options[1] === "False" && inRange;
    case "fill_blank":
      return q.options.length === 1 && q.correctIndex === 0 && q.question.includes("___");
    default: {
      const _never: never = q.type;
      return false;
    }
  }
}

export async function generateLessonQuiz(
  engine: Engine,
  notesText: string,
  chapters: readonly DraftChapter[],
  difficulty: QuizLevel,
  count = QUESTIONS_PER_LEVEL,
): Promise<DraftQuestion[]> {
  const content = capTokens(notesText, STUDY_SOURCE_TOKENS);
  return withOneRetry(`${difficulty} quiz questions`, async () => {
    const raw = await engine.structured<{ questions: unknown[] }>({
      system: lessonQuizSystem({ count, difficulty, chapterCount: chapters.length }),
      messages: [{ role: "user", content }],
      schema: lessonQuizSchema as unknown as Record<string, unknown>,
      schemaName: "lesson_quiz",
      tier: "strong",
      maxTokens: STRUCTURED_MAX_TOKENS,
    });
    const list = Array.isArray(raw?.questions) ? raw.questions : [];
    const good = list
      .map((q) => questionShape.safeParse(q))
      .flatMap((r) => (r.success && isAnswerable(r.data) ? [r.data] : []));
    if (good.length < count) throw new Error(`Only ${good.length} usable ${difficulty} questions (need ${count}).`);
    return good.slice(0, count).map((q) => ({
      type: q.type,
      difficulty,
      topic: q.topic.trim(),
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation.trim(),
      startSec: startForChapter(chapters, q.chapter),
    }));
  });
}
