"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { addLessonNote, deleteLessonNote, markLessonComplete, type ProgressResult } from "@/lib/db/progress";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";
import { saveProgress, type ProgressInput } from "@/lib/video/progress";

/* Lesson player actions (feature 11). zod → session → lesson visible to
   this user (getLessonForUser) → write. Progress and notes are personal
   student activity, so there is no audit_log row. */

const signedOut = () => fail("unauthorized", "Your session has ended. Sign in again.");

/* Periodic save from the player (at most every 15 s). A save that
   completes the lesson refreshes the page so the header and contents
   show it. The pagehide save goes through app/api/progress instead. */
export const saveWatchProgress = safeAction("saveWatchProgress", async (input: ProgressInput): Promise<ActionResult<ProgressResult>> => {
  const user = await getCurrentUser();
  if (!user) return signedOut();
  const result = await saveProgress(user, input);
  if (result.ok && result.data.newlyCompleted) refresh();
  return result;
});

export const markComplete = safeAction("markComplete", async (lessonId: string): Promise<ActionResult<ProgressResult>> => {
  if (!z.uuid().safeParse(lessonId).success) return fail("invalid", "That lesson couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return signedOut();
  const found = await getLessonForUser(lessonId, user);
  if (!found) return fail("not_found", "That lesson isn't available.");
  if (found.access !== "student") return fail("invalid", "Progress isn't recorded in preview.");
  const result = await markLessonComplete(user.id, lessonId);
  refresh();
  return ok(result);
});

export interface NoteView {
  id: string;
  atSec: number;
  text: string;
}

const noteSchema = z.object({
  lessonId: z.uuid(),
  atSec: z.number().finite().min(0).max(24 * 3600),
  text: z.string().trim().min(1, "Write something first.").max(2000, "Notes can be up to 2,000 characters."),
});

export const addNote = safeAction("addNote", async (input: z.input<typeof noteSchema>): Promise<ActionResult<NoteView>> => {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That note couldn't be saved.");
  const user = await getCurrentUser();
  if (!user) return signedOut();
  if (!(await getLessonForUser(parsed.data.lessonId, user))) return fail("not_found", "That lesson isn't available.");

  const note = await addLessonNote({ userId: user.id, ...parsed.data });
  return ok({ id: note.id, atSec: note.atSec, text: note.text });
});

export const deleteNote = safeAction("deleteNote", async (noteId: string): Promise<ActionResult> => {
  if (!z.uuid().safeParse(noteId).success) return fail("invalid", "That note couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return signedOut();
  // Scoped to the owner inside the query.
  if (!(await deleteLessonNote(user.id, noteId))) return fail("not_found", "That note couldn't be found.");
  return ok();
});
