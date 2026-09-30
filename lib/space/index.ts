import "server-only";

import { cache } from "react";
import { checkBudget } from "@/lib/ai/budget";
import { updateDocument } from "@/lib/db/documents";
import type { DocumentKind, Job, User } from "@/lib/db/schema";
import { deleteOwnedNote, getOwnedNote, getOwnedNoteDocument, listOwnedNotes, type OwnedNote } from "@/lib/db/space";
import { documentEntity, retryDocumentIngest, START_FAILED } from "@/lib/documents";
import { documentMeta } from "@/lib/documents/view";
import { cancelJob, getJobAccessToken, latestJobFor, latestJobsFor } from "@/lib/jobs";
import { TERMINAL_JOB_STATES } from "@/lib/jobs/stages";
import { deleteBlobs } from "@/lib/storage/blob";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { canRetryNote, notePhase, type NotePhase } from "./view";

/* The private space, web side (feature 19): what the dashboard and the
   note page show, and retrying or deleting a note. Everything goes through
   lib/db/space's owner-scoped reads, so it only ever sees the signed-in
   user's own notes; the work itself runs in the ingest-document task. */

/* The page and its metadata share one owner-scoped lookup per request. */
export const ownedNote = cache(getOwnedNote);

export interface SpaceNoteCard {
  id: string;
  title: string;
  kind: DocumentKind | null;
  /* "30 pages", "12:40". */
  meta: string[];
  phase: NotePhase;
  cards: number;
  questions: number;
  createdAt: Date;
}

export async function spaceNotes(ownerId: string): Promise<SpaceNoteCard[]> {
  const notes = await listOwnedNotes(ownerId);
  const jobs = await latestJobsFor("document", notes.flatMap((n) => (n.source ? [n.source.id] : [])), "ingest-document");
  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    kind: n.source?.kind ?? null,
    meta: n.source ? documentMeta({ pageCount: n.source.pageCount, durationSec: n.source.durationSec, sizeBytes: null }) : [],
    phase: notePhase(n.source, n.source ? (jobs.get(n.source.id)?.status ?? null) : null),
    cards: n.cards,
    questions: n.questions,
    createdAt: n.createdAt,
  }));
}

export interface NoteState {
  phase: NotePhase;
  /* What went wrong, in words a student can act on. */
  error: string | null;
  /* The ingest run while it's going, or when it failed after the source
     was read (the drafts or indexing stopped): JobProgress shows it. */
  job: { job: Job; token: string } | null;
}

/* Where the note page's run stands. A run that died before its task
   started never marked the document failed, so that happens here (as in
   the lesson editor, lib/documents). */
export async function noteState(note: OwnedNote): Promise<NoteState> {
  const source = note.source;
  if (!source) return { phase: "failed", error: "This note has lost its source. Delete it and add the file again.", job: null };
  const latest = await latestJobFor(documentEntity(source.id), "ingest-document");
  const ended = latest !== null && TERMINAL_JOB_STATES.includes(latest.status);
  if (latest && ended && latest.status !== "completed" && source.status === "processing") {
    const error = latest.error ?? "Reading this stopped before it finished. Try again.";
    await updateDocument(source.id, { status: "failed", error });
    return { phase: "failed", error, job: null };
  }
  const failedLater = latest?.status === "failed" && source.status === "ready";
  return {
    phase: notePhase(source, latest?.status ?? null),
    error: source.status === "failed" ? source.error : failedLater ? (latest?.error ?? null) : null,
    job: latest && (!ended || failedLater) ? { job: latest, token: await getJobAccessToken(latest) } : null,
  };
}

/* A fresh run for a note whose source couldn't be read or whose drafts
   stopped: reading is skipped if it finished, and each draft that was
   saved is kept. Only after a failure (canRetryNote), and within the
   person's daily AI limit (feature 25). */
export async function retryNoteRun(noteId: string, user: Pick<User, "id" | "role">): Promise<ActionResult> {
  const doc = await getOwnedNoteDocument(noteId, user.id);
  if (!doc) return fail("not_found", "That note isn't available.");
  const latest = await latestJobFor(documentEntity(doc.id), "ingest-document");
  if (!canRetryNote(doc, latest?.status ?? null)) return fail("conflict", "Only a note that stopped with an error can be tried again.");
  const budget = await checkBudget(user, { feature: "space-retry", entityType: "note", entityId: noteId });
  if (!budget.ok) return fail("conflict", budget.message);
  if (!(await retryDocumentIngest(doc, user.id))) return fail("conflict", START_FAILED);
  return ok();
}

/* The note goes with everything made from it; any run still working on
   it is stopped, so it doesn't keep spending, and its files leave Blob. */
export async function deleteNote(noteId: string, user: Pick<User, "id">): Promise<boolean> {
  const deleted = await deleteOwnedNote(noteId, user.id);
  if (!deleted) return false;
  const [ingests, podcasts] = await Promise.all([
    latestJobsFor("document", deleted.documentIds, "ingest-document"),
    latestJobsFor("podcast", deleted.podcastIds, "generate-podcast"),
  ]);
  await Promise.all([...ingests.values(), ...podcasts.values()].map(cancelJob));
  await deleteBlobs(deleted.blobUrls).catch((err) => console.warn("[space] note files not deleted", err));
  return true;
}
