/* Document mode (feature 18): drafts for a reading lesson, whose source is
   its documents instead of a video. Notes come from the document
   note writer (generateNoteBody: map over sections, then merge); cards
   and quiz reuse the lecture generators, with the notes' own sections
   standing in for chapters. Nothing links to a moment in a video, so
   every startSec is null. Engine passed in, no db. */

import "server-only";

import type { Block } from "@/lib/ai/types";
import { plainText } from "@/lib/markdown-blocks";
import type { Engine } from "../engine/types";
import type { DraftChapter } from "./chapters";
import { generateNoteBody } from "./index";
import { generateLessonCards, generateLessonQuiz, type DraftCard, type DraftQuestion, type QuizLevel } from "./lesson";
import { withOneRetry } from "./retry";

export interface SourceDocument {
  title: string;
  text: string;
}

/* The documents as one Markdown source, each under its own title. */
export function documentsSource(docs: readonly SourceDocument[]): string {
  return docs
    .filter((d) => d.text.trim())
    .map((d) => `# ${d.title}\n\n${d.text.trim()}`)
    .join("\n\n");
}

export async function generateDocumentNotes(engine: Engine, docs: readonly SourceDocument[], language = "English"): Promise<Block[]> {
  const source = documentsSource(docs);
  if (!source) throw new Error("The documents have no text to write notes from.");
  return withOneRetry("notes", async () => {
    const blocks = await generateNoteBody(engine, source, language);
    if (plainText(blocks).trim().length < 100) throw new Error("Empty notes.");
    return blocks;
  });
}

/* The notes split at their top-level headings into numbered sections,
   "Chapter n: title", the shape the card and quiz prompts expect. */
export function documentNotesSections(blocks: readonly Block[], fallbackTitle: string): { text: string; chapters: DraftChapter[] } {
  const top = blocks.some((b) => b.type === "heading1") && blocks.filter((b) => b.type === "heading2").length < 2 ? "heading1" : "heading2";
  const sections: { title: string; body: Block[] }[] = [];
  for (const b of blocks) {
    if (b.type === top) sections.push({ title: b.text.replace(/[*_`#]/g, "").trim(), body: [] });
    else if (sections.length === 0) sections.push({ title: fallbackTitle, body: [b] });
    else sections.at(-1)!.body.push(b);
  }
  const kept = sections.filter((s) => plainText(s.body).trim() || s.title);
  return {
    text: kept.map((s, i) => `Chapter ${i + 1}: ${s.title}\n${plainText(s.body)}`).join("\n\n"),
    // Stand-ins: only the count and titles matter to the prompts.
    chapters: kept.map((s) => ({ title: s.title, startSec: 0, summary: "" })),
  };
}

export async function generateDocumentCards(engine: Engine, notes: { text: string; chapters: DraftChapter[] }): Promise<DraftCard[]> {
  const cards = await generateLessonCards(engine, notes.text, notes.chapters);
  return cards.map((c) => ({ ...c, startSec: null }));
}

export async function generateDocumentQuiz(
  engine: Engine,
  notes: { text: string; chapters: DraftChapter[] },
  level: QuizLevel,
): Promise<DraftQuestion[]> {
  const questions = await generateLessonQuiz(engine, notes.text, notes.chapters, level);
  return questions.map((q) => ({ ...q, startSec: null }));
}
