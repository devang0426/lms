import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { chapters, chatThreads, chatTurns, lessons, transcriptSegments, videos, type ChatCitation, type ChatTurn } from "./schema";

/* Course assistant storage (feature 14). Threads are personal: every read
   and write is scoped to the owner in the query. Callers have already
   checked that the user may use the course (and lesson), or that the
   private note (feature 19) is theirs. */

export type ThreadScope =
  | {
      userId: string;
      courseId: string;
      /* Set for a thread asked from one lesson; null for course-wide. */
      lessonId: string | null;
    }
  /* A private note's chat (feature 19). */
  | { userId: string; noteId: string };

const scopeWhere = (s: ThreadScope): SQL =>
  "noteId" in s
    ? and(eq(chatThreads.userId, s.userId), eq(chatThreads.noteId, s.noteId))!
    : and(
        eq(chatThreads.userId, s.userId),
        eq(chatThreads.courseId, s.courseId),
        s.lessonId ? eq(chatThreads.lessonId, s.lessonId) : isNull(chatThreads.lessonId),
      )!;

/* The given thread if it's the user's and has this scope, else a new one. */
export async function ensureThread(scope: ThreadScope, threadId: string | undefined, title: string): Promise<string> {
  if (threadId) {
    const [row] = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), scopeWhere(scope)))
      .limit(1);
    if (row) return row.id;
  }
  const [row] = await db
    .insert(chatThreads)
    .values({ ...scope, title: title.slice(0, 120) })
    .returning({ id: chatThreads.id });
  return row.id;
}

/* The user's newest thread in this scope, with its turns, for reopening. */
export async function latestThread(scope: ThreadScope): Promise<{ id: string; turns: ChatTurn[] } | null> {
  const [thread] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(scopeWhere(scope))
    .orderBy(desc(chatThreads.createdAt))
    .limit(1);
  if (!thread) return null;
  return { id: thread.id, turns: await listTurns(thread.id, scope.userId) };
}

export async function listTurns(threadId: string, userId: string, limit = 100): Promise<ChatTurn[]> {
  const rows = await db
    .select({ turn: chatTurns })
    .from(chatTurns)
    .innerJoin(chatThreads, eq(chatThreads.id, chatTurns.threadId))
    .where(and(eq(chatTurns.threadId, threadId), eq(chatThreads.userId, userId)))
    .orderBy(desc(chatTurns.createdAt))
    .limit(limit);
  return rows.map((r) => r.turn).reverse();
}

export async function addUserTurn(threadId: string, question: string): Promise<void> {
  await db.insert(chatTurns).values({ threadId, role: "user", content: question });
}

export async function addAssistantTurn(input: {
  threadId: string;
  content: string;
  citations: ChatCitation[];
  refused: boolean;
  retrievedChunkIds: string[];
}): Promise<ChatTurn> {
  const [row] = await db
    .insert(chatTurns)
    .values({ role: "assistant", ...input })
    .returning();
  return row;
}

/* The rate limit's counter: questions the user asked in the window. */
export async function countRecentQuestions(userId: string, windowMinutes: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(chatTurns)
    .innerJoin(chatThreads, eq(chatThreads.id, chatTurns.threadId))
    .where(
      and(
        eq(chatThreads.userId, userId),
        eq(chatTurns.role, "user"),
        sql`${chatTurns.createdAt} > now() - make_interval(mins => ${windowMinutes})`,
      ),
    );
  return row?.n ?? 0;
}

/* Transcript lines inside the given time ranges, for placing a citation
   on the moment inside its chunk. The ranges come from chunks the user
   was just allowed to retrieve. Only the live (ready) video's lines: a
   replacement still processing has its own. */
export async function segmentsInRanges(
  ranges: { lessonId: string; fromSec: number; toSec: number }[],
): Promise<{ lessonId: string; startSec: number; text: string }[]> {
  if (ranges.length === 0) return [];
  return db
    .select({ lessonId: transcriptSegments.lessonId, startSec: transcriptSegments.startSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .innerJoin(videos, and(eq(videos.id, transcriptSegments.videoId), eq(videos.status, "ready")))
    .where(
      or(
        ...ranges.map((r) =>
          and(
            eq(transcriptSegments.lessonId, r.lessonId),
            sql`${transcriptSegments.startSec} >= ${r.fromSec}`,
            sql`${transcriptSegments.startSec} <= ${r.toSec}`,
          ),
        ),
      ),
    )
    .orderBy(asc(transcriptSegments.startSec));
}

/* Suggested prompts: chapter titles of the given (visible) lessons. */
export async function chapterTitles(lessonIds: string[], limit: number): Promise<string[]> {
  if (lessonIds.length === 0) return [];
  const rows = await db
    .select({ title: chapters.title })
    .from(chapters)
    .innerJoin(lessons, eq(lessons.id, chapters.lessonId))
    .where(inArray(chapters.lessonId, lessonIds))
    .orderBy(asc(lessons.position), asc(chapters.startSec))
    .limit(limit * 3);
  return [...new Set(rows.map((r) => r.title.trim()).filter(Boolean))].slice(0, limit);
}
