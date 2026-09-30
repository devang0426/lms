"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { noteMastery, notePracticeQuestions, saveNotePracticeAttempt } from "@/lib/db/quizzes";
import { getOwnedNote } from "@/lib/db/space";
import { requestNotePodcast } from "@/lib/podcast";
import { deleteNote as deleteOwnNote, retryNoteRun } from "@/lib/space";
import type { PracticeQuestion, TopicMasteryView } from "@/lib/study/quiz";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* A private note's actions (feature 19): practice quiz, podcast, retry and
   delete. Each: zod → signed in → the note must be the caller's own (in
   SQL, lib/db/space; anyone else, admins included, gets "not found") →
   work. Answers are scored on the server, as in the lesson player. */

const noteId = z.uuid();
const level = z.enum(["basic", "intermediate", "exam"]);
const answers = z
  .array(z.object({ questionId: z.uuid(), answer: z.string().max(500) }))
  .max(100);

async function owner(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: fail("unauthorized", "Your session has ended. Sign in again.") };
  if (!(await getOwnedNote(id, user.id))) return { error: fail("not_found", "That note isn't available.") };
  return { user };
}

export const loadNotePractice = safeAction("loadNotePractice", async (input: { noteId: string; level: string }): Promise<ActionResult<PracticeQuestion[]>> => {
  const parsed = z.object({ noteId, level }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Pick a difficulty.");
  const o = await owner(parsed.data.noteId);
  if ("error" in o) return o.error!;
  return ok(await notePracticeQuestions(o.user.id, parsed.data.noteId, parsed.data.level));
});

export const saveNotePractice = safeAction("saveNotePractice", async (input: {
  noteId: string;
  answers: z.input<typeof answers>;
}): Promise<ActionResult<{ score: number | null; mastery: TopicMasteryView[] }>> => {
  const parsed = z.object({ noteId, answers }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Those answers couldn't be saved.");
  const o = await owner(parsed.data.noteId);
  if ("error" in o) return o.error!;
  const saved = await saveNotePracticeAttempt(o.user.id, parsed.data.noteId, parsed.data.answers);
  return ok({ score: saved?.score ?? null, mastery: await noteMastery(o.user.id, parsed.data.noteId) });
});

/* The Podcast tab's Generate: made from the note, only when asked. */
export const generateNotePodcast = safeAction("generateNotePodcast", async (input: { noteId: string; length?: string; language?: string }): Promise<ActionResult> => {
  const parsed = z
    .object({ noteId, length: z.enum(["short", "medium", "long"]).default("short"), language: z.enum(["en", "hinglish"]).default("en") })
    .safeParse(input);
  if (!parsed.success) return fail("invalid", "That note couldn't be found.");
  const o = await owner(parsed.data.noteId);
  if ("error" in o) return o.error!;
  const result = await requestNotePodcast(o.user, parsed.data.noteId, parsed.data.length, parsed.data.language);
  refresh();
  return result;
});

/* JobProgress's retry and the failed state's "Try again" (bound to the
   note id). Only a failed note, within the daily AI limit (lib/space). */
export const retryNote = safeAction("retryNote", async (id: string): Promise<ActionResult> => {
  if (!noteId.safeParse(id).success) return fail("invalid", "That note couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const result = await retryNoteRun(id, user);
  if (result.ok) revalidatePath(`/space/${id}`);
  return result;
});

export const deleteNote = safeAction("deleteNote", async (input: { noteId: string }): Promise<ActionResult> => {
  const parsed = z.object({ noteId }).safeParse(input);
  if (!parsed.success) return fail("invalid", "That note couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if (!(await deleteOwnNote(parsed.data.noteId, user))) return fail("not_found", "That note was already deleted.");
  revalidatePath("/space");
  return ok();
});
