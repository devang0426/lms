import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { QuestionFact } from "@/lib/analytics";
import type { ChatCitation } from "@/lib/chat/types";
import { db } from "./client";
import { aiUsage, chapters, lessons, modules, videos, watchProgress, type WatchedRange } from "./schema";

/* Teaching analytics (feature 22). Call after requireCourseStaff for the
   course. Nothing here returns a student's name or id: watch ranges come
   back as anonymous lists, questions as facts about their answers.
   Students only: staff previews and questions are left out, and private
   space chats (no course) never match. */

/* Actively enrolled students of the course who aren't its staff. */
const isStudentOf = (courseId: string, userCol: SQL) => sql`
  exists (select 1 from enrollments e join sections s on s.id = e.section_id
    where s.course_id = ${courseId} and e.user_id = ${userCol} and e.status = 'active')
  and not exists (select 1 from course_staff cs where cs.course_id = ${courseId} and cs.user_id = ${userCol})
  and not exists (select 1 from users u where u.id = ${userCol} and u.role = 'admin')`;

export interface LectureWatch {
  lessonId: string;
  title: string;
  moduleTitle: string;
  durationSec: number;
  chapters: { title: string; startSec: number }[];
  /* One entry per student who has watched any of it. */
  viewers: WatchedRange[][];
}

/* Every lecture in the course with a ready video, in curriculum order. */
export async function lectureWatch(courseId: string): Promise<LectureWatch[]> {
  const lectures = await db
    .select({
      lessonId: lessons.id,
      title: lessons.title,
      moduleTitle: modules.title,
      durationSec: sql<number>`max(${videos.durationSec})`.mapWith(Number),
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(videos, and(eq(videos.lessonId, lessons.id), eq(videos.status, "ready")))
    .where(eq(modules.courseId, courseId))
    .groupBy(lessons.id, lessons.title, modules.title, modules.position, lessons.position)
    .orderBy(asc(modules.position), asc(lessons.position));
  const ids = lectures.map((l) => l.lessonId);
  if (ids.length === 0) return [];

  const [chapterRows, progress] = await db.batch([
    db
      .select({ lessonId: chapters.lessonId, title: chapters.title, startSec: chapters.startSec })
      .from(chapters)
      .where(inArray(chapters.lessonId, ids))
      .orderBy(asc(chapters.startSec)),
    db
      .select({ lessonId: watchProgress.lessonId, ranges: watchProgress.watchedRanges })
      .from(watchProgress)
      .where(and(inArray(watchProgress.lessonId, ids), isStudentOf(courseId, sql`watch_progress.user_id`))),
  ]);
  return lectures.map((l) => ({
    ...l,
    chapters: chapterRows.filter((c) => c.lessonId === l.lessonId).map(({ title, startSec }) => ({ title, startSec })),
    viewers: progress.filter((p) => p.lessonId === l.lessonId && p.ranges.length > 0).map((p) => p.ranges),
  }));
}

/* Each student question to the course assistant, as what its answer was:
   refused, or the first place it cited. */
export async function questionFacts(courseId: string): Promise<QuestionFact[]> {
  const rows = await db.execute<{ refused: boolean; citations: ChatCitation[] | null }>(sql`
    select a.refused, a.citations
    from chat_turns q
    join chat_threads t on t.id = q.thread_id
    cross join lateral (
      select a.refused, a.citations from chat_turns a
      where a.thread_id = q.thread_id and a.role = 'assistant' and a.created_at >= q.created_at
      order by a.created_at, a.id limit 1
    ) a
    where t.course_id = ${courseId} and q.role = 'user' and ${isStudentOf(courseId, sql`t.user_id`)}`);
  return rows.rows.map((r) => {
    const first = r.citations?.[0];
    return {
      refused: Boolean(r.refused),
      lessonId: first?.lessonId ?? null,
      startSec: first?.startSec ?? null,
      document: Boolean(first?.documentId),
    };
  });
}

/* Titles and chapters of a course's lessons, for naming topics. */
export async function lessonChapters(courseId: string): Promise<Map<string, { title: string; chapters: { title: string; startSec: number }[] }>> {
  const [lessonRows, chapterRows] = await db.batch([
    db
      .select({ id: lessons.id, title: lessons.title })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(eq(modules.courseId, courseId)),
    db
      .select({ lessonId: chapters.lessonId, title: chapters.title, startSec: chapters.startSec })
      .from(chapters)
      .innerJoin(lessons, eq(lessons.id, chapters.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(eq(modules.courseId, courseId)),
  ]);
  return new Map(
    lessonRows.map((l) => [l.id, { title: l.title, chapters: chapterRows.filter((c) => c.lessonId === l.id).map(({ title, startSec }) => ({ title, startSec })) }]),
  );
}

export interface FeatureCost {
  feature: string;
  calls: number;
  costUsd: number;
  recentCalls: number;
  recentCostUsd: number;
}

/* AI spend per feature (ai_usage), all time and since `since`. The whole
   university's: usage isn't recorded per course. */
export async function aiCostByFeature(since: Date): Promise<FeatureCost[]> {
  const iso = since.toISOString();
  return db
    .select({
      feature: aiUsage.feature,
      calls: sql<number>`count(*)`.mapWith(Number),
      costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`.mapWith(Number),
      recentCalls: sql<number>`count(*) filter (where ${aiUsage.createdAt} >= ${iso}::timestamptz)`.mapWith(Number),
      recentCostUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}) filter (where ${aiUsage.createdAt} >= ${iso}::timestamptz), 0)`.mapWith(Number),
    })
    .from(aiUsage)
    .groupBy(aiUsage.feature)
    .orderBy(desc(sql`sum(${aiUsage.costUsd})`));
}
