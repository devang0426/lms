import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DraftCard, DraftQuestion, QuizLevel } from "@/lib/ai/generation/lesson";
import { PROMPTS_VERSION } from "@/lib/ai/prompts";
import type { Block, DocPart } from "@/lib/ai/types";
import { auditInsert } from "./audit";
import { db } from "./client";
import { isUuid } from "./courses";
import { auditLog, documents, flashcards, notes, podcasts, quizQuestions, type DocumentKind, type DocumentRow, type DocumentStatus } from "./schema";

/* The student's private space (feature 19): notes made from their own
   uploads. Only the owner ever reads them: every query for a person is
   scoped to `ownerId` inside the SQL, with no staff or admin override. A
   note has one source document (documents.note_id); cards, questions,
   chunks, the podcast and the chat hang off the note and go with it. The
   ingest task's reads and writes (the second half) run as the system and
   are keyed by the note. Audit rows carry ids only: admins read the audit
   log, and a title or file name would tell them what a student studies. */

export interface NoteSource {
  id: string;
  kind: DocumentKind;
  title: string;
  filename: string | null;
  url: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  durationSec: number | null;
  status: DocumentStatus;
  error: string | null;
  /* An uploaded file (not a link to someone else's page). */
  hasFile: boolean;
}

export interface OwnedNote {
  id: string;
  title: string;
  blocks: Block[];
  createdAt: Date;
  source: NoteSource | null;
}

export interface OwnedNoteListItem {
  id: string;
  title: string;
  createdAt: Date;
  cards: number;
  questions: number;
  source: NoteSource | null;
}

const sourceColumns = {
  id: documents.id,
  kind: documents.kind,
  title: documents.title,
  filename: documents.filename,
  url: documents.url,
  sizeBytes: documents.sizeBytes,
  pageCount: documents.pageCount,
  durationSec: documents.durationSec,
  status: documents.status,
  error: documents.error,
  blobUrl: documents.blobUrl,
};

type SourceRow = { [K in keyof typeof sourceColumns]: (typeof sourceColumns)[K]["_"]["data"] | null } | null;

function toSource(row: SourceRow): NoteSource | null {
  if (!row?.id || !row.kind || !row.status || row.title === null) return null;
  const { blobUrl, ...rest } = row;
  return { ...rest, id: row.id, kind: row.kind, status: row.status, title: row.title, hasFile: Boolean(blobUrl) };
}

const owned = (ownerId: string) => eq(notes.ownerId, ownerId);
const sourceOf = (ownerId: string) => and(eq(documents.noteId, notes.id), eq(documents.ownerId, ownerId));

/* ---- The owner ------------------------------------------------------------- */

/* The note with its source, if it's this user's. Anyone else (an
   instructor, an admin) gets null, and the page a 404. */
export async function getOwnedNote(noteId: string, ownerId: string): Promise<OwnedNote | null> {
  if (!isUuid(noteId)) return null;
  const [row] = await db
    .select({ id: notes.id, title: notes.title, blocks: notes.blocks, createdAt: notes.createdAt, source: sourceColumns })
    .from(notes)
    .leftJoin(documents, sourceOf(ownerId))
    .where(and(eq(notes.id, noteId), owned(ownerId)))
    .orderBy(asc(documents.createdAt))
    .limit(1);
  if (!row) return null;
  return { id: row.id, title: row.title, blocks: row.blocks, createdAt: row.createdAt, source: toSource(row.source) };
}

/* The owner's source document row, for retrying its run. */
export async function getOwnedNoteDocument(noteId: string, ownerId: string): Promise<DocumentRow | null> {
  if (!isUuid(noteId)) return null;
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.noteId, noteId), eq(documents.ownerId, ownerId)))
    .orderBy(asc(documents.createdAt))
    .limit(1);
  return row ?? null;
}

/* The dashboard: the owner's notes, newest first, with their counts. */
export async function listOwnedNotes(ownerId: string): Promise<OwnedNoteListItem[]> {
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      createdAt: notes.createdAt,
      cards: sql<number>`(select count(*) from flashcards f where f.note_id = notes.id and f.lesson_id is null)`.mapWith(Number),
      questions: sql<number>`(select count(*) from quiz_questions q where q.note_id = notes.id and q.lesson_id is null)`.mapWith(Number),
      source: sourceColumns,
    })
    .from(notes)
    .leftJoin(documents, sourceOf(ownerId))
    .where(owned(ownerId))
    .orderBy(desc(notes.createdAt));
  return rows.map(({ source, ...r }) => ({ ...r, source: toSource(source) }));
}

/* A new note and the document it will be made from, in one batch. */
export async function createPrivateNote(input: {
  ownerId: string;
  title: string;
  source: {
    kind: DocumentKind;
    status: "uploading" | "processing";
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    url?: string;
  };
}): Promise<{ noteId: string; document: DocumentRow }> {
  const noteId = crypto.randomUUID();
  const title = input.title.slice(0, 160);
  const [, [document]] = await db.batch([
    db.insert(notes).values({ id: noteId, ownerId: input.ownerId, title, promptsVersion: PROMPTS_VERSION }),
    db.insert(documents).values({ ownerId: input.ownerId, noteId, title, createdBy: input.ownerId, ...input.source }).returning(),
    auditInsert({ actorId: input.ownerId, action: "space.note_created", entityType: "note", entityId: noteId }),
  ]);
  return { noteId, document };
}

/* New notes in the window, for the rate limit. Counted from the audit log,
   so deleting a note doesn't give its slot back. */
export async function countRecentNotes(ownerId: string, windowMinutes: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.actorId, ownerId),
        eq(auditLog.action, "space.note_created"),
        sql`${auditLog.createdAt} > now() - make_interval(mins => ${windowMinutes})`,
      ),
    );
  return row?.n ?? 0;
}

export interface DeletedNote {
  /* Blob files to delete: the upload and any podcast MP3. */
  blobUrls: string[];
  documentIds: string[];
  podcastIds: string[];
}

/* Deletes the note and everything made from it (cascade: its document,
   cards and their reviews, questions and attempts, chunks, podcast and
   chat). Null when it isn't this owner's note. */
export async function deleteOwnedNote(noteId: string, ownerId: string): Promise<DeletedNote | null> {
  if (!isUuid(noteId)) return null;
  const [found, files, casts] = await db.batch([
    db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, noteId), owned(ownerId))).limit(1),
    db.select({ id: documents.id, url: documents.blobUrl }).from(documents).where(and(eq(documents.noteId, noteId), eq(documents.ownerId, ownerId))),
    db
      .select({ id: podcasts.id, url: podcasts.audioUrl })
      .from(podcasts)
      .innerJoin(notes, eq(notes.id, podcasts.noteId))
      .where(and(eq(podcasts.noteId, noteId), owned(ownerId))),
  ]);
  if (found.length === 0) return null;
  await db.batch([
    db.delete(notes).where(and(eq(notes.id, noteId), owned(ownerId))),
    auditInsert({ actorId: ownerId, action: "space.note_deleted", entityType: "note", entityId: noteId }),
  ]);
  return {
    blobUrls: [...files, ...casts].flatMap((f) => (f.url ? [f.url] : [])),
    documentIds: files.map((f) => f.id),
    podcastIds: casts.map((c) => c.id),
  };
}

/* A note whose upload never finished (the browser gave up): removed
   without a trace, so a failed upload doesn't leave an empty note. */
export async function discardUnfinishedNote(noteId: string, ownerId: string): Promise<boolean> {
  if (!isUuid(noteId)) return false;
  const rows = await db
    .delete(notes)
    .where(
      and(
        eq(notes.id, noteId),
        owned(ownerId),
        sql`exists (select 1 from documents d where d.note_id = notes.id and d.status = 'uploading')`,
      ),
    )
    .returning({ id: notes.id });
  return rows.length > 0;
}

/* ---- The ingest task (runs as the system) ----------------------------------- */

export interface NoteDraftSource {
  noteId: string;
  ownerId: string;
  title: string;
  blocks: Block[];
  /* Ready source documents with text, oldest first. */
  documents: { id: string; title: string; text: string }[];
}

export async function loadNoteSource(noteId: string): Promise<NoteDraftSource | null> {
  const [noteRows, docRows] = await db.batch([
    db
      .select({ ownerId: notes.ownerId, title: notes.title, blocks: notes.blocks })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNotNull(notes.ownerId)))
      .limit(1),
    db
      .select({ id: documents.id, title: documents.title, text: documents.text })
      .from(documents)
      .where(and(eq(documents.noteId, noteId), eq(documents.status, "ready")))
      .orderBy(asc(documents.createdAt)),
  ]);
  const note = noteRows[0];
  if (!note?.ownerId) return null;
  return { noteId, ownerId: note.ownerId, title: note.title, blocks: note.blocks, documents: docRows.filter((d) => d.text.trim()) };
}

/* What indexing needs: the owner and each ready document's citable parts. */
export async function loadNoteIndexSource(
  noteId: string,
): Promise<{ ownerId: string; documents: { id: string; title: string; parts: DocPart[] }[] } | null> {
  const [noteRows, docRows] = await db.batch([
    db.select({ ownerId: notes.ownerId }).from(notes).where(eq(notes.id, noteId)).limit(1),
    db
      .select({ id: documents.id, title: documents.title, parts: documents.parts })
      .from(documents)
      .where(and(eq(documents.noteId, noteId), eq(documents.status, "ready")))
      .orderBy(asc(documents.createdAt)),
  ]);
  const ownerId = noteRows[0]?.ownerId;
  return ownerId ? { ownerId, documents: docRows } : null;
}

/* Once the source is read, the note takes its title: a web page or a video
   brings its own, a file keeps the name it was given. */
export async function syncNoteTitle(noteId: string): Promise<void> {
  await db.execute(sql`update notes set title = d.title, updated_at = now()
    from documents d
    where notes.id = ${noteId} and d.note_id = notes.id and d.status = 'ready' and notes.title is distinct from d.title`);
}

/* Drafts are saved published: a student's own notes have no review step. */
export async function saveNoteBlocks(noteId: string, blocks: Block[]): Promise<void> {
  await db
    .update(notes)
    .set({ blocks, status: "published", promptsVersion: PROMPTS_VERSION, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), isNotNull(notes.ownerId)));
}

const noteCards = (noteId: string) => and(eq(flashcards.noteId, noteId), isNull(flashcards.lessonId));
const noteQuestions = (noteId: string) => and(eq(quizQuestions.noteId, noteId), isNull(quizQuestions.lessonId));

export async function hasNoteContent(kind: "cards" | "quiz", noteId: string, level?: QuizLevel): Promise<boolean> {
  const [row] =
    kind === "cards"
      ? await db.select({ id: flashcards.id }).from(flashcards).where(noteCards(noteId)).limit(1)
      : await db
          .select({ id: quizQuestions.id })
          .from(quizQuestions)
          .where(and(noteQuestions(noteId), level ? eq(quizQuestions.difficulty, level) : undefined))
          .limit(1);
  return Boolean(row);
}

export async function replaceNoteCards(noteId: string, drafts: DraftCard[]): Promise<void> {
  const insert = drafts.length
    ? [
        db
          .insert(flashcards)
          .values(drafts.map((c, position) => ({ noteId, position, ...c, status: "published" as const, promptsVersion: PROMPTS_VERSION }))),
      ]
    : [];
  await db.batch([db.delete(flashcards).where(noteCards(noteId)), ...insert]);
}

/* One level at a time, so a quiz run resumes where it stopped. */
export async function replaceNoteQuizLevel(noteId: string, level: QuizLevel, drafts: DraftQuestion[]): Promise<void> {
  const insert = drafts.length
    ? [
        db
          .insert(quizQuestions)
          .values(drafts.map((q, position) => ({ noteId, position, ...q, status: "published" as const, promptsVersion: PROMPTS_VERSION }))),
      ]
    : [];
  await db.batch([db.delete(quizQuestions).where(and(noteQuestions(noteId), eq(quizQuestions.difficulty, level))), ...insert]);
}
