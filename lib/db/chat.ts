import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type BatchRows } from "./client";
import { isLimitError, lockFor, underLimit } from "./limits";
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

/* A question, if the person is under the question limit (feature 25, S3):
   one locked batch (lib/db/limits) counts their questions in the window,
   then reads the thread's history, creates the thread if the given one
   isn't theirs in this scope, and saves the question. Over the limit,
   nothing is written — not even the thread — and the result is null. */
export async function reserveQuestion(input: {
  scope: ThreadScope;
  threadId: string | undefined;
  question: string;
  limit: { questions: number; minutes: number };
}): Promise<{ threadId: string; history: ChatTurn[] } | null> {
  const { scope, question, limit } = input;
  const given = input.threadId ?? null;
  const fresh = crypto.randomUUID();
  const inScope = scopeWhere(scope);
  const on = "noteId" in scope ? { courseId: null, lessonId: null, noteId: scope.noteId } : { courseId: scope.courseId, lessonId: scope.lessonId, noteId: null };
  try {
    const [, , history, , turn] = await db.batch([
      lockFor("ai", scope.userId),
      underLimit(recentQuestions(scope.userId, limit.minutes), limit.questions, "questions"),
      // Before the question is saved, so it isn't part of its own history.
      db
        .select({ turn: chatTurns })
        .from(chatTurns)
        .innerJoin(chatThreads, eq(chatThreads.id, chatTurns.threadId))
        .where(and(eq(chatTurns.threadId, given ?? fresh), inScope))
        .orderBy(desc(chatTurns.createdAt))
        .limit(100),
      db.execute(sql`
        insert into chat_threads (id, user_id, course_id, lesson_id, note_id, title)
        select ${fresh}::uuid, ${scope.userId}::uuid, ${on.courseId}::uuid, ${on.lessonId}::uuid, ${on.noteId}::uuid, ${question.slice(0, 120)}
        where not exists (select 1 from chat_threads where chat_threads.id = ${given}::uuid and ${inScope})`),
      db.execute(sql`
        insert into chat_turns (thread_id, role, content)
        select chat_threads.id, 'user'::chat_role, ${question} from chat_threads
        where chat_threads.id = ${fresh}::uuid or (chat_threads.id = ${given}::uuid and ${inScope})
        limit 1
        returning thread_id`),
    ]);
    const threadId = (turn.rows[0] as { thread_id: string } | undefined)?.thread_id;
    if (!threadId) throw new Error("The question wasn't saved.");
    return { threadId, history: threadId === given ? history.map((r) => r.turn).reverse() : [] };
  } catch (err) {
    if (isLimitError(err)) return null;
    throw err;
  }
}

/* The question limit's count: the questions the user asked in the window,
   across the assistant and the space chat. */
function recentQuestions(userId: string, windowMinutes: number): SQL {
  return sql`select count(*) from chat_turns join chat_threads on chat_threads.id = chat_turns.thread_id
    where chat_threads.user_id = ${userId}::uuid and chat_turns.role = 'user'
      and chat_turns.created_at > now() - make_interval(mins => ${windowMinutes})`;
}

/* The user's newest thread in this scope, with its turns, for reopening.
   The turns are read through the same "newest thread" subquery, so both
   statements share a batch instead of waiting on each other (feature 29). */
export function latestThreadQueries(scope: ThreadScope, limit = 100) {
  const newest = db.select({ id: chatThreads.id }).from(chatThreads).where(scopeWhere(scope)).orderBy(desc(chatThreads.createdAt)).limit(1);
  return [
    newest,
    db
      .select({ turn: chatTurns })
      .from(chatTurns)
      .where(eq(chatTurns.threadId, db.select({ id: chatThreads.id }).from(chatThreads).where(scopeWhere(scope)).orderBy(desc(chatThreads.createdAt)).limit(1)))
      .orderBy(desc(chatTurns.createdAt))
      .limit(limit),
  ] as const;
}

export function toLatestThread([[thread], turns]: BatchRows<ReturnType<typeof latestThreadQueries>>): { id: string; turns: ChatTurn[] } | null {
  return thread ? { id: thread.id, turns: turns.map((r) => r.turn).reverse() } : null;
}

export async function latestThread(scope: ThreadScope): Promise<{ id: string; turns: ChatTurn[] } | null> {
  return toLatestThread(await db.batch(latestThreadQueries(scope)));
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
export function chapterTitlesQuery(lessonIds: string[], limit: number) {
  return db
    .select({ title: chapters.title })
    .from(chapters)
    .innerJoin(lessons, eq(lessons.id, chapters.lessonId))
    .where(lessonIds.length ? inArray(chapters.lessonId, lessonIds) : sql`false`)
    .orderBy(asc(lessons.position), asc(chapters.startSec))
    .limit(limit * 3);
}

export function toChapterTitles(rows: readonly { title: string }[], limit: number): string[] {
  return [...new Set(rows.map((r) => r.title.trim()).filter(Boolean))].slice(0, limit);
}

export async function chapterTitles(lessonIds: string[], limit: number): Promise<string[]> {
  if (lessonIds.length === 0) return [];
  return toChapterTitles(await chapterTitlesQuery(lessonIds, limit), limit);
}
