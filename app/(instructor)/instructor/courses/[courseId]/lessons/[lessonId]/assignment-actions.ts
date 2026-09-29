"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { saveAssignmentStatement } from "@/lib/db/assignments";
import { db } from "@/lib/db/client";
import { getLessonForUser } from "@/lib/db/courses";
import { assignmentEventStatement } from "@/lib/db/events";
import { ASSIGNMENT_CATEGORIES } from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Set an assignment lesson's instructions, due date and points (feature
   20). zod → course staff (getLessonForUser gives staff access in SQL) →
   the upsert and its audit row in one batch. */

const input = z.object({
  lessonId: z.uuid(),
  instructions: z.string().trim().max(20_000, "Keep the instructions under 20,000 characters."),
  /* ISO time from the browser, so the instructor's time zone is kept. */
  dueAt: z.iso.datetime({ offset: true, message: "Pick a due date and time." }),
  points: z.number().int().min(1, "Give it at least 1 point.").max(1000, "1,000 points at most."),
  allowLate: z.boolean(),
  category: z.enum(ASSIGNMENT_CATEGORIES),
});

export async function saveAssignment(raw: z.input<typeof input>): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { lessonId, ...fields } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.access !== "staff") return fail("not_found", "That lesson doesn't exist or isn't yours to edit.");
  if (found.lesson.kind !== "assignment") return fail("invalid", "Only assignment lessons take instructions and a due date.");

  const dueAt = new Date(fields.dueAt);
  await db.batch([
    saveAssignmentStatement({ lessonId, ...fields, dueAt, createdBy: user.id }),
    // The due date on the calendar (feature 21), after the upsert.
    assignmentEventStatement(lessonId),
    auditInsert({
      actorId: user.id,
      action: "assignment.save",
      entityType: "lesson",
      entityId: lessonId,
      data: { dueAt: dueAt.toISOString(), points: fields.points, allowLate: fields.allowLate, category: fields.category },
    }),
  ]);
  const courseId = found.course.id;
  revalidatePath(`/instructor/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/instructor/courses/${courseId}/gradebook`);
  revalidatePath(`/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath("/grades");
  revalidatePath("/calendar");
  revalidatePath("/");
  return ok();
}
