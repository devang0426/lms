/* A student's flashcard with its FSRS schedule (feature 15). Pure: shared
   by lib/db/study.ts (which applies ratings) and the review deck (which
   previews each button's next interval with the same math). */

import type { Flashcard } from "@/lib/ai/types";
import { reviewCard, type Rating } from "./fsrs";

export const RATINGS: readonly Rating[] = ["again", "hard", "good", "easy"];

export interface StudyCard {
  id: string;
  courseId: string;
  courseCode: string;
  lessonId: string;
  lessonTitle: string;
  front: string;
  back: string;
  topic: string;
  /* Where the card's idea is taught ("Review in video"). */
  startSec: number | null;
  /* FSRS state, as fsrs.ts uses it (epoch ms). */
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  state: Flashcard["state"];
}

/* fsrs.ts works on NitroAI's Flashcard shape; only the schedule matters. */
export function asFsrsCard(c: StudyCard): Flashcard {
  return {
    id: c.id,
    noteId: "",
    front: c.front,
    back: c.back,
    topic: c.topic,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.lastReview ?? undefined,
    state: c.state,
  };
}

/* How long until the card comes back, for each rating (ms). */
export function nextIntervals(card: StudyCard, nowMs: number): Record<Rating, number> {
  const fsrs = asFsrsCard(card);
  return Object.fromEntries(RATINGS.map((r) => [r, reviewCard(fsrs, r, nowMs).due - nowMs])) as Record<Rating, number>;
}

/* The card after a rating, keeping its course and lesson fields. */
export function applyRating(card: StudyCard, rating: Rating, nowMs: number): StudyCard {
  const next = reviewCard(asFsrsCard(card), rating, nowMs);
  return { ...card, due: next.due, stability: next.stability, difficulty: next.difficulty, reps: next.reps, lapses: next.lapses, lastReview: nowMs, state: next.state };
}

/* "10m", "5h", "3d", "2mo", "1y": short labels under the rating buttons. */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(days / 365)}y`;
}
