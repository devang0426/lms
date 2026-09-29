import type { WatchedRange } from "@/lib/db/schema";

/* Teaching analytics (feature 22). Pure: the watch heat-strip, where
   viewing drops off, questions grouped by chapter, and the refusal rate.
   No function here sees a student's identity. */

/* How many viewers watched each slice of the video. A slice counts for a
   viewer when their watched ranges cover at least half of it. Ranges are
   the merged [start, end] pairs of watch_progress, so this shows coverage
   and drop-off; a second viewing of the same part isn't stored. */
export function heatStrip(viewers: WatchedRange[][], durationSec: number, bins = 60): number[] {
  const counts = new Array<number>(bins).fill(0);
  if (!(durationSec > 0) || bins < 1) return counts;
  const size = durationSec / bins;
  for (const ranges of viewers) {
    for (let b = 0; b < bins; b++) {
      const from = b * size;
      const to = from + size;
      let covered = 0;
      for (const [s, e] of ranges) covered += Math.max(0, Math.min(e, to) - Math.max(s, from));
      if (covered >= size / 2) counts[b]++;
    }
  }
  return counts;
}

/* The first slice, after one that more than half the viewers reached,
   where fewer than half of them are still watching; null when they stay. */
export function dropOffBin(counts: number[], viewers: number): number | null {
  if (viewers === 0) return null;
  const half = viewers / 2;
  let reached = false;
  for (let b = 0; b < counts.length; b++) {
    if (counts[b] > half) reached = true;
    else if (reached && counts[b] < half) return b;
  }
  return null;
}

export interface QuestionFact {
  refused: boolean;
  /* The first citation of the answer, if it had one. */
  lessonId: string | null;
  startSec: number | null;
  /* A document citation groups under its lesson, not a chapter. */
  document: boolean;
}

export interface TopicCount {
  lessonId: string;
  lessonTitle: string;
  /* null = the lesson as a whole (a document, or a lesson without chapters). */
  chapterTitle: string | null;
  questions: number;
}

/* Answered questions grouped by the chapter their first citation points
   into (the chapter whose start is the latest at or before the cited
   time), most asked first. Refused questions aren't topics. */
export function groupTopics(
  facts: QuestionFact[],
  lessons: Map<string, { title: string; chapters: { title: string; startSec: number }[] }>,
  limit = 10,
): TopicCount[] {
  const counts = new Map<string, TopicCount>();
  for (const f of facts) {
    if (f.refused || !f.lessonId) continue;
    const lesson = lessons.get(f.lessonId);
    if (!lesson) continue;
    let chapter: string | null = null;
    if (!f.document && f.startSec !== null) {
      for (const c of [...lesson.chapters].sort((a, b) => a.startSec - b.startSec)) {
        if (c.startSec <= f.startSec + 0.001) chapter = c.title;
      }
    }
    const key = `${f.lessonId}|${chapter ?? ""}`;
    const entry = counts.get(key) ?? { lessonId: f.lessonId, lessonTitle: lesson.title, chapterTitle: chapter, questions: 0 };
    entry.questions++;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.questions - a.questions || a.lessonTitle.localeCompare(b.lessonTitle) || (a.chapterTitle ?? "").localeCompare(b.chapterTitle ?? ""))
    .slice(0, limit);
}

/* Share of questions the assistant refused, 0–1; null with no questions. */
export function refusalRate(facts: Pick<QuestionFact, "refused">[]): number | null {
  if (facts.length === 0) return null;
  return facts.filter((f) => f.refused).length / facts.length;
}
