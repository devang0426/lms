import "server-only";

import { and, asc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { asFsrsCard, type StudyCard } from "@/lib/study/cards";
import { newCardState, reviewCard, type Rating } from "@/lib/study/fsrs";
import { db, type BatchRows } from "./client";
import { cardReviews, courses, flashcards, lessons, modules, notes, type CardState } from "./schema";

/* Flashcard review (feature 15). Every query decides visibility in SQL: a
   student studies a card only when it is published, its lesson, module
   and course are published, and they are actively enrolled. Their FSRS
   state is their own row in card_reviews; a card with no row is new and
   due now. Ratings are applied here, on the server, with lib/study/fsrs.
   A private note's cards (feature 19) are its owner's alone: they're
   joined through the note on its owner, and never show up in /study. */

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

const reviewColumns = {
  due: cardReviews.due,
  stability: cardReviews.stability,
  difficulty: cardReviews.difficulty,
  reps: cardReviews.reps,
  lapses: cardReviews.lapses,
  lastReview: cardReviews.lastReview,
  state: cardReviews.state,
};

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
      review: reviewColumns,
    })
    .from(flashcards)
    .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .leftJoin(cardReviews, review(userId));
}

/* A private note's cards, only when the note is this user's (feature 19). */
function ownedCards(userId: string) {
  return db
    .select({
      id: flashcards.id,
      courseId: sql<string | null>`null`,
      courseCode: sql<string | null>`null`,
      lessonId: sql<string | null>`null`,
      lessonTitle: sql<string | null>`null`,
      front: flashcards.front,
      back: flashcards.back,
      topic: flashcards.topic,
      startSec: flashcards.startSec,
      review: reviewColumns,
    })
    .from(flashcards)
    .innerJoin(notes, and(eq(notes.id, flashcards.noteId), eq(notes.ownerId, userId), isNull(flashcards.lessonId)))
    .leftJoin(cardReviews, review(userId));
}

type Row =
  | Awaited<ReturnType<ReturnType<typeof visibleCards>["execute"]>>[number]
  | Awaited<ReturnType<ReturnType<typeof ownedCards>["execute"]>>[number];

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
  /* Cards due now (`cards` holds at most the limit of them). */
  due: number;
  /* When the next card comes due, if none is due now. */
  nextDueAt: number | null;
}

/* The cards in `deck` due now (in `order`), and the deck's size, due count
   and next due time, as two statements for the caller's batch. A card
   with no review due later is due now, which is what `due` counts. */
function queueQueries(userId: string, deck: SQL, due: SQL | undefined, order: SQL[], limit: number) {
  return [
    visibleCards(userId).where(and(deck, due)).orderBy(...order).limit(limit),
    db
      .select({
        n: sql<number>`count(*)`.mapWith(Number),
        due: sql<number>`count(*) filter (where ${cardReviews.cardId} is null)`.mapWith(Number),
        next: sql<Date | null>`min(${cardReviews.due})`,
      })
      .from(flashcards)
      .innerJoin(lessons, eq(lessons.id, flashcards.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .leftJoin(cardReviews, and(review(userId), gt(cardReviews.due, sql`now()`)))
      .where(deck),
  ] as const;
}

export function toStudyQueue([rows, [agg]]: BatchRows<ReturnType<typeof queueQueries>>): StudyQueue {
  const now = Date.now();
  const cards = rows.map((r) => toStudyCard(r, now));
  const next = agg?.next ? new Date(agg.next).getTime() : null;
  return { cards, total: agg?.n ?? 0, due: agg?.due ?? 0, nextDueAt: cards.length === 0 ? next : null };
}

export async function studyQueue(userId: string, scope: StudyScope, limit: number): Promise<StudyQueue> {
  return toStudyQueue(await db.batch(queueQueries(userId, visibleTo(userId, scope), isDue, ORDER, limit)));
}

/* The lesson player's Flashcards tab, for its batch (feature 29): the
   student's due cards, or for a staff preview the whole deck in lesson
   order, all new and unsaved (the page checked staff access first). */
export function lessonDeckQueries(userId: string, lessonId: string, preview: boolean, limit: number) {
  return preview
    ? queueQueries(userId, eq(flashcards.lessonId, lessonId), undefined, [asc(flashcards.position)], limit)
    : queueQueries(userId, visibleTo(userId, { lessonId }), isDue, ORDER, limit);
}

/* studyQueue for a private note's deck (feature 19), its owner's only. */
export async function noteStudyQueue(userId: string, noteId: string, limit: number): Promise<StudyQueue> {
  const ofNote = eq(flashcards.noteId, noteId);
  const counted = db
    .select({ n: sql<number>`count(*)`.mapWith(Number), next: sql<Date | null>`min(${cardReviews.due})` })
    .from(flashcards)
    .innerJoin(notes, and(eq(notes.id, flashcards.noteId), eq(notes.ownerId, userId), isNull(flashcards.lessonId)))
    .leftJoin(cardReviews, and(review(userId), gt(cardReviews.due, sql`now()`)))
    .where(ofNote);
  const [rows, [agg]] = await db.batch([
    ownedCards(userId)
      .where(and(ofNote, isDue))
      .orderBy(ORDER[0], asc(cardReviews.due), asc(flashcards.position))
      .limit(limit),
    counted,
  ]);
  const now = Date.now();
  const cards = rows.map((r) => toStudyCard(r, now));
  const next = agg?.next ? new Date(agg.next).getTime() : null;
  return { cards, total: agg?.n ?? 0, due: cards.length, nextDueAt: cards.length === 0 ? next : null };
}

export interface DueCount {
  courseId: string;
  code: string;
  title: string;
  due: number;
}

function dueCountsQuery(userId: string) {
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

/* Due counts per enrolled course (the /study filters and the sidebar
   notice), read once per request (feature 29): the first caller's read is
   shared, including one made inside /study's batch (loadStudyPage). */
const dueCountsRead = cache((_userId: string): { counts: Promise<DueCount[]> | null } => ({ counts: null }));

export function dueCountsByCourse(userId: string): Promise<DueCount[]> {
  const read = dueCountsRead(userId);
  // Promise.resolve: awaiting a query builder twice would run it twice.
  return (read.counts ??= Promise.resolve(dueCountsQuery(userId)));
}

/* /study's reads in one batch: the due counts (shared with the sidebar
   notice) and the queue. */
export async function loadStudyPage(userId: string, scope: StudyScope, limit: number): Promise<{ counts: DueCount[]; queue: StudyQueue }> {
  const read = dueCountsRead(userId);
  if (read.counts) {
    const [counts, queue] = await Promise.all([read.counts, studyQueue(userId, scope, limit)]);
    return { counts, queue };
  }
  const batch = db.batch([dueCountsQuery(userId), ...queueQueries(userId, visibleTo(userId, scope), isDue, ORDER, limit)]);
  read.counts = batch.then(([counts]) => counts);
  read.counts.catch(() => {}); // the page awaits the batch itself
  const [counts, rows, totals] = await batch;
  return { counts, queue: toStudyQueue([rows, totals]) };
}

export type ReviewOutcome = { due: number; state: CardState; intervalMs: number };

/* Apply one rating. Returns null when the card isn't live for this student
   (a 404 for the caller), so nobody can write a schedule for a card they
   can't see. A private note's card counts only for its owner. */
export async function recordReview(userId: string, cardId: string, rating: Rating): Promise<ReviewOutcome | null> {
  const [course, own] = await db.batch([
    visibleCards(userId)
      .where(and(eq(flashcards.id, cardId), visibleTo(userId, {})))
      .limit(1),
    ownedCards(userId).where(eq(flashcards.id, cardId)).limit(1),
  ]);
  const row = course[0] ?? own[0];
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

