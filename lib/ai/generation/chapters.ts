/* Lecture chapters (feature 12). The model reads the transcript with
   [mm:ss] markers and returns 6–15 chapters; each start time is snapped to
   the nearest real segment start, so a chapter never begins mid-sentence
   and always seeks to something the lecturer said. */

import "server-only";

import { z } from "zod";
import { formatTime, parseT } from "@/lib/time";
import { activeIndex } from "@/lib/video/watch";
import type { Engine } from "../engine/types";
import { CHAPTERS_MAX, CHAPTERS_MIN, chaptersSchema, chaptersSystem } from "../prompts";
import { estimateTokens } from "./chunk";
import { withOneRetry } from "./retry";

export interface TimedSegment {
  startSec: number;
  text: string;
}

export interface DraftChapter {
  title: string;
  startSec: number;
  summary: string;
}

/* Beyond this the transcript is condensed into longer lines, which keeps
   one request well inside every model's context in the fast chain. */
const TRANSCRIPT_TOKENS = 40_000;
/* Room for reasoning plus the answer, but a runaway answer (one model
   padded its JSON with 16k tokens of whitespace) fails fast. */
export const STRUCTURED_MAX_TOKENS = 8000;

/* "[04:12] text" per line. Long lectures merge consecutive segments into
   15, 30, then 60-second lines until the text fits. */
export function transcriptForPrompt(segments: readonly TimedSegment[], maxTokens = TRANSCRIPT_TOKENS): string {
  for (const window of [0, 15, 30, 60, 120]) {
    const lines: string[] = [];
    let start = 0;
    let buf: string[] = [];
    for (const s of segments) {
      if (buf.length > 0 && s.startSec - start >= window) {
        lines.push(`[${formatTime(start)}] ${buf.join(" ")}`);
        buf = [];
      }
      if (buf.length === 0) start = s.startSec;
      buf.push(s.text.trim());
    }
    if (buf.length > 0) lines.push(`[${formatTime(start)}] ${buf.join(" ")}`);
    const text = lines.join("\n");
    if (estimateTokens(text) <= maxTokens || window === 120) return text;
  }
  return "";
}

/* Lectures under ~6 minutes can't hold six minute-long chapters. */
export function chapterRange(durationSec: number): { min: number; max: number } {
  return { min: Math.max(1, Math.min(CHAPTERS_MIN, Math.floor(durationSec / 60))), max: CHAPTERS_MAX };
}

/* Snap each start to the nearest segment start, force the first chapter to
   0:00, sort, and drop chapters that land on the same moment. */
export function snapChapters(
  raw: readonly { start: string | number; title: string; summary: string }[],
  segmentStarts: readonly number[],
): DraftChapter[] {
  if (segmentStarts.length === 0) return [];
  const snapped = raw
    .map((c) => {
      const at = typeof c.start === "number" ? c.start : parseT(c.start);
      if (at === null || !Number.isFinite(at)) return null;
      return { title: c.title.trim(), summary: c.summary.trim(), startSec: nearest(segmentStarts, at) };
    })
    .filter((c): c is DraftChapter => c !== null && c.title.length > 0)
    .sort((a, b) => a.startSec - b.startSec);

  const out: DraftChapter[] = [];
  for (const c of snapped) {
    if (out.length > 0 && c.startSec === out[out.length - 1].startSec) continue;
    out.push(c);
  }
  if (out.length > 0) out[0].startSec = 0;
  return out;
}

/* Chapters this close together are merged (the later one dropped). */
const MIN_GAP_SEC = 20;

/* Keep only chapters at least MIN_GAP_SEC after the previous kept one. */
export function dropCrowded(chapters: readonly DraftChapter[], durationSec: number): DraftChapter[] {
  const gap = durationSec < 6 * 60 ? 0 : MIN_GAP_SEC;
  const out: DraftChapter[] = [];
  for (const c of chapters) {
    if (out.length === 0 || c.startSec - out[out.length - 1].startSec >= gap) out.push(c);
  }
  return out;
}

/* Why these chapters don't cover the lecture, or null if they do: no
   chapter (the last runs to the end) may be longer than 40% of the
   lecture, and never more than half of it beyond two minutes. */
export function coverageProblem(chapters: readonly DraftChapter[], durationSec: number): string | null {
  if (chapters.length < 2 || durationSec <= 0) return null;
  const limit = Math.max(0.4 * durationSec, Math.min(120, 0.5 * durationSec));
  for (let i = 0; i < chapters.length; i++) {
    const end = chapters[i + 1]?.startSec ?? durationSec;
    if (end - chapters[i].startSec > limit) {
      return `Chapter ${i + 1} runs ${Math.round(end - chapters[i].startSec)} s of a ${Math.round(durationSec)} s lecture.`;
    }
  }
  return null;
}

function nearest(starts: readonly number[], at: number): number {
  const i = Math.max(0, activeIndex(starts, at));
  const next = starts[i + 1];
  return next !== undefined && next - at < at - starts[i] ? next : starts[i];
}

const chaptersOutput = z.object({
  chapters: z.array(z.object({ start: z.string(), title: z.string().max(120), summary: z.string().max(600) })),
});

export async function generateChapters(
  engine: Engine,
  segments: readonly TimedSegment[],
  opts: { durationSec: number; language?: string },
): Promise<DraftChapter[]> {
  if (segments.length === 0) throw new Error("This lecture has no transcript to split into chapters.");
  const { min, max } = chapterRange(opts.durationSec);
  const transcript = transcriptForPrompt(segments);
  const starts = segments.map((s) => s.startSec);

  return withOneRetry("chapters", async () => {
    const raw = await engine.structured<unknown>({
      system: chaptersSystem(opts.language ?? "English", formatTime(opts.durationSec)),
      messages: [{ role: "user", content: transcript }],
      schema: chaptersSchema as unknown as Record<string, unknown>,
      schemaName: "chapters",
      // Structured output on the fast chain was slow and could run away
      // (feature 12 notes in progress-tracker.md); strong answers in seconds.
      tier: "strong",
      maxTokens: STRUCTURED_MAX_TOKENS,
    });
    const chapters = dropCrowded(snapChapters(chaptersOutput.parse(raw).chapters, starts), opts.durationSec).slice(0, max);
    if (chapters.length < min) throw new Error(`Only ${chapters.length} usable chapters (need ${min}).`);
    const problem = coverageProblem(chapters, opts.durationSec);
    if (problem) throw new Error(problem);
    return chapters;
  });
}
