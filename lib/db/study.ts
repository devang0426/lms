import "server-only";

import { and, asc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { asFsrsCard, type StudyCard } from "@/lib/study/cards";
import { newCardState, reviewCard, type Rating } from "@/lib/study/fsrs";
import { db } from "./client";
import { cardReviews, courses, flashcards, lessons, modules, type CardState } from "./schema";

/* Flashcard review (feature 15). Every query decides visibility in SQL: a
   student studies a card only when it is published, its lesson, module
   and course are published, and they are actively enrolled. Their FSRS
   state is their own row in card_reviews; a card with no row is new and
   due now. Ratings are applied here, on the server, with lib/study/fsrs. */

export type { StudyCard };

export interface StudyScope {
  courseId?: string;
  lessonId?: string;
}

const review = (userId: string) => and(eq(cardReviews.cardId, flashcards.id), eq(cardReviews.userId, userId));

/* The card is live for this enrolled student. `courses.id` is named
   literally inside the subquery (see lib/db/courses.ts). */
function visibleTo(userId: string, scope: StudyScope): SQL {
  return and(
    eq(flashcards.status, "published"),
    eq(lessons.status, "published"),
    eq(modules.status, "published"),
    eq(courses.status, "published"),
    sql`exists (select 1 from enrollments e join sections s on s.id = e.section_id
      where s.course_id = courses.id and e.user_id = ${userId} and e.status = 'active')`,
    scope.courseId ? eq(courses.id, scope.courseId) : undefined,
    scope.lessonId ? eq(lessons.id, scope.lessonId) : undefined,
  )!;
}

const isDue = or(isNull(cardReviews.userId), lte(cardReviews.due, sql`now()`))!;

function visibleCards(userId: string) {
  return db
    .select({
      id: flashcards.id,
      courseId: courses.id,
      courseCode: courses.code,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      front: flashcards.front,
      back: flashcards.back,
      topic: flashcards.topic,
      startSec: flashcards.startSec,
      review: {
        due: cardReviews.due,
        stability: cardReviews.stability,
        difficulty: cardReviews.difficulty,
        reps: cardReviews.reps,
        lapses: cardReviews.lapses,
        lastReview: cardReviews.lastReview,
        state: cardReviews.state,
      },
    })
    .from(flashcards)
    .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .leftJoin(cardReviews, review(userId));
}

type Row = Awaited<ReturnType<ReturnType<typeof visibleCards>["execute"]>>[number];

function toStudyCard(row: Row, nowMs: number): StudyCard {
  const { review: r, ...card } = row;
  // A left join with no review row gives all-null review fields.
  if (!r || r.due === null) return { ...card, ...newCardState(nowMs), lastReview: null };
  return {
    ...card,
    due: r.due.getTime(),
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
    lastReview: r.lastReview?.getTime() ?? null,
    state: r.state,
  };
}

/* Study order (lib/study/fsrs.ts studyOrder): new cards first, in course
   order, then cards being (re)learned, then reviews, soonest due first. */
const ORDER = [
  sql`case when ${cardReviews.state} is null or ${cardReviews.state} = 'new' then 0
    when ${cardReviews.state} in ('learning', 'relearning') then 1 else 2 end`,
  asc(cardReviews.due),
  asc(modules.position),
  asc(lessons.position),
  asc(flashcards.position),
];

/* Cards due now for this student. Never-reviewed cards are new and due. */
export async function dueCards(userId: string, scope: StudyScope, limit: number): Promise<StudyCard[]> {
  const rows = await visibleCards(userId)
    .where(and(visibleTo(userId, scope), isDue))
    .orderBy(...ORDER)
    .limit(limit);
  const now = Date.now();
  return rows.map((r) => toStudyCard(r, now));
}

export interface StudyQueue {
  cards: StudyCard[];
  /* All live cards in the scope, due or not. */
  total: number;
  /* When the next card comes due, if none is due now. */
  nextDueAt: number | null;
}

/* The due cards plus what the empty state needs, in one round trip. */
export async function studyQueue(userId: string, scope: StudyScope, limit: number): Promise<StudyQueue> {
  const counted = db
    .select({ n: sql<number>`count(*)`.mapWith(Number), next: sql<Date | null>`min(${cardReviews.due})` })
    .from(flashcards)
    .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .leftJoin(cardReviews, and(review(userId), gt(cardReviews.due, sql`now()`)))
    .where(visibleTo(userId, scope));
  const [rows, [agg]] = await db.batch([
    visibleCards(userId).where(and(visibleTo(userId, scope), isDue)).orderBy(...ORDER).limit(limit),
    counted,
  ]);
  const now = Date.now();
  const cards = rows.map((r) => toStudyCard(r, now));
  const next = agg?.next ? new Date(agg.next).getTime() : null;
  return { cards, total: agg?.n ?? 0, nextDueAt: cards.length === 0 ? next : null };
}

/* Due counts per enrolled course (the /study filters and the sidebar notice). */
export async function dueCountsByCourse(userId: string): Promise<{ courseId: string; code: string; title: string; due: number }[]> {
  return db
    .select({
      courseId: courses.id,
      code: courses.code,
      title: courses.title,
      due: sql<number>`count(*)`.mapWith(Number),
    })
    .from(flashcards)
    .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .leftJoin(cardReviews, review(userId))
    .where(and(visibleTo(userId, {}), isDue))
    .groupBy(courses.id, courses.code, courses.title)
    .orderBy(asc(courses.code));
}

export type ReviewOutcome = { due: number; state: CardState; intervalMs: number };

/* Apply one rating. Returns null when the card isn't live for this student
   (a 404 for the caller), so nobody can write a schedule for a card they
   can't see. */
export async function recordReview(userId: string, cardId: string, rating: Rating): Promise<ReviewOutcome | null> {
  const [row] = await visibleCards(userId)
    .where(and(eq(flashcards.id, cardId), visibleTo(userId, {})))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const current = toStudyCard(row, now);
  const next = reviewCard(asFsrsCard(current), rating, now);
  const values = {
    due: new Date(next.due),
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    lastReview: new Date(now),
    state: next.state,
  };
  await db
    .insert(cardReviews)
    .values({ userId, cardId, ...values })
    .onConflictDoUpdate({ target: [cardReviews.userId, cardReviews.cardId], set: values });
  return { due: next.due, state: next.state, intervalMs: next.due - now };
}

/* Staff preview of a lesson's deck (drafts included, nothing recorded).
   The caller has already checked course staff. */
export async function previewCards(lessonId: string): Promise<StudyCard[]> {
  const rows = await db
    .select({
      id: flashcards.id,
      courseId: courses.id,
      courseCode: courses.code,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      front: flashcards.front,
      back: flashcards.back,
      topic: flashcards.topic,
      startSec: flashcards.startSec,
    })
    .from(flashcards)
    .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(flashcards.lessonId, lessonId))
    .orderBy(asc(flashcards.position));
  const now = Date.now();
  return rows.map((r) => ({ ...r, ...newCardState(now), lastReview: null }));
}
