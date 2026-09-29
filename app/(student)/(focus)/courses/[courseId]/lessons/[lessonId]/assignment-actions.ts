"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { handIn } from "@/lib/coursework";
import { SUBMIT_MESSAGES } from "@/lib/coursework/rules";
import { getAssignment } from "@/lib/db/assignments";
import { getLessonForUser } from "@/lib/db/courses";
import { MAX_SUBMISSION_FILES } from "@/lib/storage/upload-kinds";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Hand in an assignment (feature 20). zod → the lesson must be visible to
   this user as a student (getLessonForUser, in SQL) → the upsert, which
   checks the due date, late rule and grading lock itself. Files arrive as
   refs to what the browser already put in Blob; each is checked there. */

const input = z.object({
  lessonId: z.uuid(),
  assignmentId: z.uuid(),
  text: z.string().max(20_000, "Keep the answer under 20,000 characters."),
  /* Files of the current version to keep, by position. */
  keep: z.array(z.number().int().min(0).max(20)).max(MAX_SUBMISSION_FILES),
  files: z
    .array(z.object({ url: z.url(), pathname: z.string().min(1).max(300), name: z.string().max(200) }))
    .max(MAX_SUBMISSION_FILES, `Attach ${MAX_SUBMISSION_FILES} files at most.`),
});

const MESSAGES = {
  ...SUBMIT_MESSAGES,
  not_found: "This assignment isn't available.",
  empty: "Write an answer or attach a file first.",
  too_many: `Attach ${MAX_SUBMISSION_FILES} files at most.`,
  bad_files: "One of the files didn't upload properly. Remove it and add it again.",
} as const;

export async function handInAssignment(raw: z.input<typeof input>): Promise<ActionResult<{ late: boolean }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That work couldn't be handed in.");
  const { lessonId, assignmentId, text, keep, files } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.access !== "student") return fail("not_found", MESSAGES.not_found);
  const assignment = await getAssignment(lessonId);
  if (!assignment || assignment.id !== assignmentId) return fail("not_found", MESSAGES.not_found);

  const result = await handIn(user, { assignmentId, text, keep, files });
  if (!result.ok) {
    const code = result.reason === "not_found" ? "not_found" : result.reason === "locked" || result.reason === "closed" ? "conflict" : "invalid";
    return fail(code, MESSAGES[result.reason]);
  }
  revalidatePath(`/courses/${found.course.id}/lessons/${lessonId}`);
  revalidatePath("/grades");
  revalidatePath("/instructor/grading");
  return ok({ late: result.late });
}
