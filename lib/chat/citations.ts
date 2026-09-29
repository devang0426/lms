/* The course assistant's answer checks (feature 14). Pure: no db, no
   engine, so the chat UI uses it too (stripMarkers while streaming).

   The model cites its numbered sources inline as [S3]. After the stream:
   - the refusal token, or no valid citation at all, means a refusal;
   - a citation to a source that wasn't sent is dropped, and a run of
     three or more markers keeps its first two;
   - the survivors are renumbered in order of first use, so in the saved
     answer [S1] is citations[0], [S2] is citations[1], and so on. */

import { formatTime } from "@/lib/time";
import type { ChatCitation } from "./types";

export const NOT_IN_SYLLABUS = "<<NOT_IN_SYLLABUS>>";

const MARKER = /\[S(\d+)\]/g;
/* "[S1, S3]", "[S1,S3]", "[S1; S3]", "[S1 S3]" → "[S1][S3]" */
const GROUP = /\[S\d+(?:\s*[,;]?\s*S?\d+)+\]/g;

export function normalizeMarkers(text: string): string {
  return text.replace(GROUP, (group) =>
    [...group.matchAll(/\d+/g)].map((m) => `[S${m[0]}]`).join(""),
  );
}

export type CheckedAnswer =
  | { refused: true }
  /* `cited` holds the 0-based indexes of the sources used, in the order
     of the renumbered markers. */
  | { refused: false; content: string; cited: number[] };

/* The prompt asks for two citations at most per claim; a model that stacks
   "[S1] [S2] [S3] [S4]" after a sentence keeps the first two. */
const MARKER_RUN = /\[S\d+\](?:\s*\[S\d+\]){2,}/g;

export function checkAnswer(raw: string, sourceCount: number): CheckedAnswer {
  const text = normalizeMarkers(raw.trim()).replace(MARKER_RUN, (run) => (run.match(/\[S\d+\]/g) ?? []).slice(0, 2).join(""));
  if (text === "" || text.includes(NOT_IN_SYLLABUS)) return { refused: true };

  const cited: number[] = [];
  const content = text
    .replace(MARKER, (_m, n: string) => {
      const index = Number(n) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= sourceCount) return "";
      if (!cited.includes(index)) cited.push(index);
      return `[S${cited.indexOf(index) + 1}]`;
    })
    // A removed marker can leave "word ." or two spaces behind.
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (cited.length === 0) return { refused: true };
  return { refused: false, content, cited };
}

/* For text shown while it streams (and for chat history sent back to the
   model): no markers at all, including a half-written one at the end. */
export function stripMarkers(text: string): string {
  return normalizeMarkers(text)
    .replace(MARKER, "")
    .replace(/\[S?\d*$/, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

/* While the answer streams, hold text back as long as it could still be
   the refusal token, so "<<NOT_IN_SYLLABUS>>" never flashes on screen.
   Returns how many characters of `full` may be shown now. */
export function releasable(full: string): number {
  const t = full.trimStart();
  if (t === "") return 0;
  if (NOT_IN_SYLLABUS.startsWith(t) || t.startsWith(NOT_IN_SYLLABUS)) return 0;
  return full.length;
}

/* The sentences of an answer that cite source `n` (1-based, as written). */
export function claimsFor(text: string, n: number): string {
  return normalizeMarkers(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => sentence.includes(`[S${n}]`))
    .join(" ");
}

/* The saved answer's [S#] markers → inline chips (.cite-chip buttons) in
   the Markdown, before lib/markdown renders and sanitizes it. [S1] is
   citations[0]; a marker with no citation behind it becomes nothing, so a
   made-up [S9] can never render. */
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function citationChipsHtml(content: string, citations: ChatCitation[]): string {
  return normalizeMarkers(content).replace(MARKER, (_m, n: string) => {
    const index = Number(n) - 1;
    const c = citations[index];
    if (!c) return "";
    const short = c.page !== null ? `p. ${c.page}` : c.startSec !== null ? formatTime(c.startSec) : c.section ? shorten(c.section, 24) : "source";
    return `<button type="button" class="cite-chip" data-cite="${index}" aria-label="${escapeHtml(c.label)}">${escapeHtml(short)}</button>`;
  });
}

/* "Lecture 3 · 12:48", or "Lecture 3". A document chunk (feature 18) is
   named after its document: "Week 2 slides · p. 7", "Reading · Eigenvalues",
   "Office hours · 04:10". */
export function citationLabel(
  ordinal: number | null,
  startSec: number | null,
  page: number | null,
  doc?: { title: string; section?: string | null } | null,
): string {
  const where = page !== null ? `p. ${page}` : startSec !== null ? formatTime(startSec) : (doc?.section ?? null);
  const what = doc ? shorten(doc.title, 60) : ordinal ? `Lecture ${ordinal}` : "Course material";
  return [what, where].filter(Boolean).join(" · ");
}

function shorten(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/* ---- Where in the chunk ------------------------------------------------------
   A chunk spans up to 90 s, but a chip should land where the cited idea is
   said. Pick the transcript segment inside the chunk that shares the most
   words with the claim (and the question); with too little overlap to
   trust, keep the chunk's start. */

const STOP = new Set(
  (
    "the and for are but not you your with this that these those from into onto over under then than " +
    "what which who whom whose when where why how does did doing done can could would should will shall " +
    "has have had was were been being its it's our their there here they them she her his him about " +
    "also just very more most some such only own other each any all both few many much again once " +
    "explain tell mean means meaning show give let lets please lecture lesson course video"
  ).split(" "),
);

export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)).map(stem));
}

/* Crude plural/tense folding: "vectors" ~ "vector", "scaled" ~ "scale". */
function stem(w: string): string {
  return w.replace(/(?:ies|es|s|ed|ing)$/, "") || w;
}

export interface TimedText {
  startSec: number;
  text: string;
}

export const MIN_OVERLAP = 2;

export function bestMoment<T extends TimedText>(segments: T[], claim: string): T | null {
  const wanted = contentWords(claim);
  let best: T | null = null;
  let bestScore = MIN_OVERLAP - 1;
  for (const seg of segments) {
    let score = 0;
    for (const w of contentWords(seg.text)) if (wanted.has(w)) score++;
    if (score > bestScore) {
      best = seg;
      bestScore = score;
    }
  }
  return best;
}
