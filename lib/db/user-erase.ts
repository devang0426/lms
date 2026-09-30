import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { DELETED_USER_NAME } from "@/lib/account/rules";
import { auditInsert } from "./audit";
import { db } from "./client";
import {
  cardReviews,
  chatThreads,
  contentChunks,
  courseStaff,
  dataExports,
  documents,
  enrollments,
  invitations,
  jobs,
  lessonNotes,
  notes,
  notifications,
  podcasts,
  quizAttempts,
  users,
  watchProgress,
  type Job,
  type User,
} from "./schema";

/* Account deletion (feature 33). A deleted account is marked first (the
   person is signed out from then on: getCurrentUser treats the row as
   gone), then the erase-user task removes their private data and
   anonymises the row. Kept, per the decisions in the feature spec:
   submissions, grades and graded quiz attempts (academic records),
   discussion posts (shown under "Deleted user"), announcements, ai_usage,
   audit_log, and course content they made. Enrollments are kept too, as
   dropped. */

export type DeleteVia = "admin" | "clerk";

/* Mark the account deleted, with its audit row. Nothing happens to a row
   that's already deleted (a webhook after the admin's delete). Returns
   whether this call marked it. */
export async function markUserDeleted(userId: string, by: { actorId: string; via: DeleteVia }): Promise<boolean> {
  // One statement: the audit row is written only if the update marked it.
  const result = await db.execute(sql`
    with marked as (
      update users set deleted_at = now(), updated_at = now()
      where id = ${userId}::uuid and deleted_at is null
      returning id
    )
    insert into audit_log (actor_id, action, entity_type, entity_id, data)
    select ${by.actorId}::uuid, 'user.delete', 'user', marked.id::text, ${JSON.stringify({ via: by.via })}::jsonb
    from marked
    returning entity_id`);
  return result.rows.length > 0;
}

export async function userByClerkId(clerkId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  return row ?? null;
}

/* The row the erase task works on: any state, deleted or not (it checks). */
export async function userForErase(userId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export interface EraseLeftovers {
  /* Files the rows point at: private uploads, their notes' podcasts, exports. */
  blobUrls: string[];
  /* The person's unfinished runs (the erase itself left out). */
  jobs: Job[];
}

/* What deleting the rows leaves outside them, read first. */
export async function eraseLeftovers(userId: string): Promise<EraseLeftovers> {
  const [files, casts, exports, running] = await db.batch([
    db.select({ url: documents.blobUrl }).from(documents).where(eq(documents.ownerId, userId)),
    db
      .select({ url: podcasts.audioUrl })
      .from(podcasts)
      .innerJoin(notes, eq(notes.id, podcasts.noteId))
      .where(eq(notes.ownerId, userId)),
    db.select({ url: dataExports.blobUrl }).from(dataExports).where(eq(dataExports.userId, userId)),
    db
      .select()
      .from(jobs)
      .where(and(eq(jobs.createdBy, userId), inArray(jobs.status, ["queued", "running"]), ne(jobs.kind, "erase-user"))),
  ]);
  return {
    blobUrls: [...files, ...casts, ...exports].flatMap((f) => (f.url ? [f.url] : [])),
    jobs: running,
  };
}

export interface ErasedCounts {
  notes: number;
  chats: number;
  practiceAttempts: number;
}

/* Delete the person's private data and anonymise their row, in one batch
   (one transaction). Safe to run again: a second run finds nothing left
   and anonymises the same row. The audit row carries counts only. */
export async function eraseUserRows(user: Pick<User, "id" | "email">, requestedBy: string): Promise<ErasedCounts> {
  const email = user.email.trim().toLowerCase();
  const [, goneNotes, goneChats, goneAttempts] = await db.batch([
    auditInsert({ actorId: requestedBy, action: "user.erase", entityType: "user", entityId: user.id }),
    // A note takes everything made from it (cascade): its source document,
    // cards and their reviews, questions and attempts, chunks, podcasts and chat.
    db.delete(notes).where(eq(notes.ownerId, user.id)).returning({ id: notes.id }),
    db.delete(chatThreads).where(eq(chatThreads.userId, user.id)).returning({ id: chatThreads.id }),
    db
      .delete(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.mode, "practice")))
      .returning({ id: quizAttempts.id }),
    db.delete(documents).where(eq(documents.ownerId, user.id)),
    db.delete(contentChunks).where(eq(contentChunks.ownerId, user.id)),
    db.delete(lessonNotes).where(eq(lessonNotes.userId, user.id)),
    db.delete(cardReviews).where(eq(cardReviews.userId, user.id)),
    db.delete(watchProgress).where(eq(watchProgress.userId, user.id)),
    db.delete(notifications).where(eq(notifications.userId, user.id)),
    db.delete(dataExports).where(eq(dataExports.userId, user.id)),
    db.delete(courseStaff).where(eq(courseStaff.userId, user.id)),
    // Kept for the record, like any dropped enrollment.
    db
      .update(enrollments)
      .set({ status: "dropped" })
      .where(and(eq(enrollments.userId, user.id), eq(enrollments.status, "active"))),
    ...(email ? [db.delete(invitations).where(eq(invitations.email, email))] : []),
    db
      .update(users)
      .set({
        name: DELETED_USER_NAME,
        email: "",
        imageUrl: null,
        deletedAt: sql`coalesce(${users.deletedAt}, now())`,
        erasedAt: new Date(),
      })
      .where(eq(users.id, user.id)),
  ]);
  return { notes: goneNotes.length, chats: goneChats.length, practiceAttempts: goneAttempts.length };
}

/* Deleted accounts whose erase never finished (a run that couldn't start,
   or failed every retry), for the daily clean-up to finish. */
export async function unerasedDeletedUsers(before: Date, limit: number): Promise<Pick<User, "id">[]> {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletedAt), isNull(users.erasedAt), lt(users.deletedAt, before)))
    .orderBy(asc(users.deletedAt))
    .limit(limit);
}
