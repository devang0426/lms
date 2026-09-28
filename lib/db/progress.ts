import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { isWatchedEnough, MAX_RANGES, mergeRanges, type Range } from "@/lib/video/watch";
import type { NextLesson } from "./catalog";
import { db } from "./client";
import { isUuid } from "./courses";
import { lessonNotes, lessons, modules, watchProgress, type LessonNote, type WatchProgress } from "./schema";

/* Student activity in the lesson player (feature 11): watch progress and
   timestamped personal notes. Every read and write is keyed by the owning
   user. Callers check that the user may see the lesson first
   (getLessonForUser) — these functions don't repeat that check. */

export async function getWatchProgress(userId: string, lessonId: string): Promise<WatchProgress | null> {
  const [row] = await db
    .select()
    .from(watchProgress)
    .where(and(eq(watchProgress.userId, userId), eq(watchProgress.lessonId, lessonId)))
    .limit(1);
  return row ?? null;
}

export interface ProgressResult {
  completed: boolean;
  /* True only on the save that crossed into completion. */
  newlyCompleted: boolean;
}

/* Save the position and the union of stored and reported ranges, clamped
   to the video's real length. Crossing 90% watched completes the lesson;
   completion is never undone. */
export async function recordProgress(input: {
  userId: string;
  lessonId: string;
  durationSec: number | null;
  positionSec: number;
  ranges: Range[];
}): Promise<ProgressResult> {
  const existing = await getWatchProgress(input.userId, input.lessonId);
  const duration = input.durationSec && input.durationSec > 0 ? input.durationSec : Infinity;
  const ranges = mergeRanges([...(existing?.watchedRanges ?? []), ...input.ranges], duration).slice(0, MAX_RANGES);
  const position = Math.min(Math.max(0, input.positionSec), duration);
  const wasComplete = Boolean(existing?.completedAt);
  const complete = wasComplete || (input.durationSec !== null && isWatchedEnough(ranges, input.durationSec));
  const completedAt = complete ? (existing?.completedAt ?? new Date()) : null;

  await db
    .insert(watchProgress)
    .values({ userId: input.userId, lessonId: input.lessonId, positionSec: position, watchedRanges: ranges, completedAt })
    .onConflictDoUpdate({
      target: [watchProgress.userId, watchProgress.lessonId],
      set: {
        positionSec: position,
        watchedRanges: ranges,
        completedAt: sql`coalesce(${watchProgress.completedAt}, excluded.completed_at)`,
        updatedAt: new Date(),
      },
    });
  return { completed: complete, newlyCompleted: complete && !wasComplete };
}

/* "Mark complete". Keeps any saved position and ranges. */
export async function markLessonComplete(userId: string, lessonId: string): Promise<ProgressResult> {
  const [row] = await db
    .insert(watchProgress)
    .values({ userId, lessonId, completedAt: new Date() })
    .onConflictDoUpdate({
      target: [watchProgress.userId, watchProgress.lessonId],
      set: { completedAt: new Date(), updatedAt: new Date() },
      setWhere: sql`${watchProgress.completedAt} is null`,
    })
    .returning({ lessonId: watchProgress.lessonId });
  return { completed: true, newlyCompleted: Boolean(row) };
}

/* The user's completed lessons in one course. */
export async function completedLessonIds(userId: string, courseId: string): Promise<Set<string>> {
  if (!isUuid(courseId)) return new Set();
  const rows = await db
    .select({ lessonId: watchProgress.lessonId })
    .from(watchProgress)
    .innerJoin(lessons, eq(lessons.id, watchProgress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(watchProgress.userId, userId), eq(modules.courseId, courseId), isNotNull(watchProgress.completedAt)));
  return new Set(rows.map((r) => r.lessonId));
}

export interface CourseProgress {
  completedLessons: number;
  lastWatchedAt: Date | null;
}

/* Completed published lessons and the latest activity, per course. */
export async function courseProgressFor(userId: string, courseIds: string[]): Promise<Map<string, CourseProgress>> {
  const ids = courseIds.filter(isUuid);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      courseId: modules.courseId,
      completedLessons: sql<number>`count(*) filter (where ${watchProgress.completedAt} is not null)`.mapWith(Number),
      lastWatchedAt: sql<Date | null>`max(${watchProgress.updatedAt})`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(watchProgress)
    .innerJoin(lessons, eq(lessons.id, watchProgress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(
      and(
        eq(watchProgress.userId, userId),
        inArray(modules.courseId, ids),
        eq(modules.status, "published"),
        eq(lessons.status, "published"),
      ),
    )
    .groupBy(modules.courseId);
  return new Map(rows.map((r) => [r.courseId, { completedLessons: r.completedLessons, lastWatchedAt: r.lastWatchedAt }]));
}

/* Where "Continue" points in each course: the most recently watched
   lesson that isn't complete, else the first unfinished one in course
   order. Courses with every lesson complete are absent. */
export async function nextLessonsFor(userId: string, courseIds: string[]): Promise<Map<string, NextLesson>> {
  const ids = courseIds.filter(isUuid);
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([modules.courseId], {
      courseId: modules.courseId,
      lessonId: lessons.id,
      title: lessons.title,
      kind: lessons.kind,
      durationSec: lessons.durationSec,
      moduleTitle: modules.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(watchProgress, and(eq(watchProgress.lessonId, lessons.id), eq(watchProgress.userId, userId)))
    .where(
      and(
        inArray(modules.courseId, ids),
        eq(modules.status, "published"),
        eq(lessons.status, "published"),
        sql`${watchProgress.completedAt} is null`,
      ),
    )
    .orderBy(modules.courseId, sql`${watchProgress.updatedAt} desc nulls last`, asc(modules.position), asc(lessons.position));
  return new Map(rows.map((r) => [r.courseId, r]));
}

export async function listLessonNotes(userId: string, lessonId: string): Promise<LessonNote[]> {
  return db
    .select()
    .from(lessonNotes)
    .where(and(eq(lessonNotes.userId, userId), eq(lessonNotes.lessonId, lessonId)))
    .orderBy(asc(lessonNotes.atSec), desc(lessonNotes.createdAt));
}

export async function addLessonNote(input: { userId: string; lessonId: string; atSec: number; text: string }): Promise<LessonNote> {
  const [row] = await db.insert(lessonNotes).values(input).returning();
  return row;
}

/* Only the note's owner can delete it; returns false for anyone else. */
export async function deleteLessonNote(userId: string, noteId: string): Promise<boolean> {
  if (!isUuid(noteId)) return false;
  const rows = await db
    .delete(lessonNotes)
    .where(and(eq(lessonNotes.id, noteId), eq(lessonNotes.userId, userId)))
    .returning({ id: lessonNotes.id });
  return rows.length > 0;
}
