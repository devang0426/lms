import "server-only";

import { and, count, eq, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { contentChunks, lessons, notes, type ChunkKind } from "./schema";

/* The retrieval index (feature 13). Writing: a lesson's chunks are replaced
   in one batch, so a search never sees the lesson half indexed. Reading:
   the access filter is part of every search query — never filter the
   results afterwards (architecture.md invariant 4). */

/* ---- Writing ---------------------------------------------------------------- */

/* A transcript chunk (kind "video") or a document chunk (kind "doc",
   feature 18) with its page, section or time. */
export interface NewLessonChunk {
  kind: "video" | "doc";
  text: string;
  startSec: number | null;
  endSec: number | null;
  page?: number | null;
  section?: string | null;
  documentId?: string | null;
  embedding: number[];
}

const INSERT_GROUP = 50; // rows per INSERT; each vector is ~20 KB of SQL

/* Replace the lesson's chunks, but only while the lesson is still
   published: an Unpublish that lands during embedding wins. Returns false
   when the lesson was no longer published (nothing written). */
export async function replaceLessonChunks(input: {
  lessonId: string;
  courseId: string;
  model: string;
  chunks: NewLessonChunk[];
}): Promise<boolean> {
  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, input.lessonId)).limit(1);
  if (lesson?.status !== "published") {
    await db.delete(contentChunks).where(eq(contentChunks.lessonId, input.lessonId));
    return false;
  }
  const rows = input.chunks.map((c) => ({
    courseId: input.courseId,
    lessonId: input.lessonId,
    kind: c.kind,
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
    page: c.page ?? null,
    section: c.section ?? null,
    documentId: c.documentId ?? null,
    embedding: c.embedding,
    model: input.model,
  }));
  const inserts = [];
  for (let i = 0; i < rows.length; i += INSERT_GROUP) {
    inserts.push(db.insert(contentChunks).values(rows.slice(i, i + INSERT_GROUP)));
  }
  await db.batch([deleteLessonChunks(input.lessonId), ...inserts]);
  return true;
}

/* A statement, so Unpublish can put it in the same batch as the status change. */
export function deleteLessonChunks(lessonId: string) {
  return db.delete(contentChunks).where(eq(contentChunks.lessonId, lessonId));
}

export async function countLessonChunks(lessonId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(contentChunks).where(eq(contentChunks.lessonId, lessonId));
  return row?.n ?? 0;
}

/* A private note's chunks (feature 19): owned by the student, in no course.
   Replaced in one batch, and only while the note is still theirs (a note
   deleted during embedding gets nothing). Returns false when it's gone. */
export async function replaceNoteChunks(input: {
  noteId: string;
  ownerId: string;
  model: string;
  chunks: NewLessonChunk[];
}): Promise<boolean> {
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, input.noteId), eq(notes.ownerId, input.ownerId)))
    .limit(1);
  if (!note) return false;
  const rows = input.chunks.map((c) => ({
    ownerId: input.ownerId,
    noteId: input.noteId,
    kind: c.kind,
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
    page: c.page ?? null,
    section: c.section ?? null,
    documentId: c.documentId ?? null,
    embedding: c.embedding,
    model: input.model,
  }));
  const inserts = [];
  for (let i = 0; i < rows.length; i += INSERT_GROUP) {
    inserts.push(db.insert(contentChunks).values(rows.slice(i, i + INSERT_GROUP)));
  }
  await db.batch([deleteNoteChunks(input.noteId), ...inserts]);
  return true;
}

export function deleteNoteChunks(noteId: string) {
  return db.delete(contentChunks).where(eq(contentChunks.noteId, noteId));
}

/* ---- Searching -------------------------------------------------------------- */

/* `coursesOf` (the private space's "Include my courses", feature 19): the
   chunks of every course the user is enrolled in or teaches. The access
   filter below still decides which of them they may see. */
export type ChunkScope = { courseId: string } | { lessonId: string } | { ownerId: string } | { coursesOf: string };

export interface ChunkHit {
  id: string;
  courseId: string | null;
  lessonId: string | null;
  noteId: string | null;
  ownerId: string | null;
  kind: ChunkKind;
  text: string;
  startSec: number | null;
  endSec: number | null;
  page: number | null;
  documentId: string | null;
  section: string | null;
  model: string;
  /* Cosine similarity to the query, 0–1 in practice. */
  similarity: number;
  /* ts_rank_cd when the chunk matches the full-text query, else null. */
  ftsRank: number | null;
}

/* Who may read chunk `c`, in SQL:
   - a private chunk: only its owner;
   - a course chunk: any admin, the course's staff, or a student with an
     active enrollment in a published course — and, for a lesson's chunk,
     only while its module and the lesson are published. */
function accessible(userId: string): SQL {
  return sql`(
    (c.owner_id is not null and c.owner_id = ${userId})
    or (c.course_id is not null and (
      exists (select 1 from users u where u.id = ${userId} and u.role = 'admin')
      or exists (select 1 from course_staff cs where cs.course_id = c.course_id and cs.user_id = ${userId})
      or (
        exists (select 1 from enrollments e join sections s on s.id = e.section_id
          where s.course_id = c.course_id and e.user_id = ${userId} and e.status = 'active')
        and exists (select 1 from courses co where co.id = c.course_id and co.status = 'published')
        and (c.lesson_id is null or exists (select 1 from lessons l join modules m on m.id = l.module_id
          where l.id = c.lesson_id and m.course_id = c.course_id and l.status = 'published' and m.status = 'published'))
      )
    ))
  )`;
}

function inScope(scope: ChunkScope): SQL {
  if ("courseId" in scope) return sql`c.course_id = ${scope.courseId}`;
  if ("lessonId" in scope) return sql`c.lesson_id = ${scope.lessonId}`;
  if ("coursesOf" in scope) {
    return sql`(c.course_id is not null and (
      exists (select 1 from enrollments e join sections s on s.id = e.section_id
        where s.course_id = c.course_id and e.user_id = ${scope.coursesOf} and e.status = 'active')
      or exists (select 1 from course_staff cs where cs.course_id = c.course_id and cs.user_id = ${scope.coursesOf})))`;
  }
  return sql`c.owner_id = ${scope.ownerId}`;
}

/* websearch_to_tsquery ANDs the words, so a full-text hit means every
   content word of the question is in the chunk. That is a strong on-topic
   signal, which the assistant's relevance gate relies on (an OR query
   would let "plane tickets" through on the word "plane"). Paraphrases are
   the vector search's job. */
const hitColumns = (vector: string, query: string) => sql`
  c.id, c.course_id, c.lesson_id, c.note_id, c.owner_id, c.kind, c.text,
  c.start_sec, c.end_sec, c.page, c.document_id, c.section, c.model,
  1 - (c.embedding <=> ${vector}::vector) as similarity,
  case when c.tsv @@ websearch_to_tsquery('english', ${query})
    then ts_rank_cd(c.tsv, websearch_to_tsquery('english', ${query})) end as fts_rank`;

/* Vector top-k and full-text top-k in one round trip. Both lists carry
   both scores, so fusion can use either copy of a chunk. */
export async function searchChunkCandidates(input: {
  userId: string;
  scope: ChunkScope;
  query: string;
  embedding: number[];
  k: number;
}): Promise<{ vector: ChunkHit[]; text: ChunkHit[] }> {
  const vector = JSON.stringify(input.embedding);
  const where = and(inScope(input.scope), accessible(input.userId));
  const [, byVector, byText] = await db.batch([
    // The HNSW index returns its nearest neighbours before the access
    // filter runs; iterative scan keeps searching until k rows pass it.
    db.execute(sql`select set_config('hnsw.iterative_scan', 'strict_order', true)`),
    db.execute(sql`select ${hitColumns(vector, input.query)} from content_chunks c
      where ${where}
      order by c.embedding <=> ${vector}::vector
      limit ${input.k}`),
    db.execute(sql`select ${hitColumns(vector, input.query)} from content_chunks c
      where c.tsv @@ websearch_to_tsquery('english', ${input.query}) and ${where}
      order by fts_rank desc, c.id
      limit ${input.k}`),
  ]);
  return { vector: byVector.rows.map(toHit), text: byText.rows.map(toHit) };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toHit(row: Record<string, unknown>): ChunkHit {
  return {
    id: String(row.id),
    courseId: (row.course_id as string | null) ?? null,
    lessonId: (row.lesson_id as string | null) ?? null,
    noteId: (row.note_id as string | null) ?? null,
    ownerId: (row.owner_id as string | null) ?? null,
    kind: row.kind as ChunkKind,
    text: String(row.text),
    startSec: num(row.start_sec),
    endSec: num(row.end_sec),
    page: num(row.page),
    documentId: (row.document_id as string | null) ?? null,
    section: (row.section as string | null) ?? null,
    model: String(row.model),
    similarity: Number(row.similarity),
    ftsRank: num(row.fts_rank),
  };
}
