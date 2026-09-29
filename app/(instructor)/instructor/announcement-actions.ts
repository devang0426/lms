"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { announcementForStaff, deleteAnnouncementStatement, postAnnouncementStatements } from "@/lib/db/announcements";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { getCourseAccess } from "@/lib/db/courses";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Announcements (feature 21), posted from the dashboard's "Post
   announcement" and Messages. zod → course staff → the announcement, one
   notification per enrolled student and the audit row in one batch. */

const postInput = z.object({
  courseId: z.uuid({ message: "Pick a course." }),
  title: z.string().trim().min(3, "Give it a short title.").max(140, "Keep the title under 140 characters."),
  body: z.string().trim().min(1, "Write the announcement first.").max(10_000, "Keep it under 10,000 characters."),
});

export async function postAnnouncement(raw: z.input<typeof postInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = postInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the announcement and try again.");
  const { courseId, title, body } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if ((await getCourseAccess(courseId, user)) !== "staff") return fail("not_found", "That course doesn't exist or isn't one you teach.");

  const id = crypto.randomUUID();
  await db.batch([
    auditInsert({ actorId: user.id, action: "announcement.post", entityType: "announcement", entityId: id, data: { courseId, title } }),
    ...postAnnouncementStatements({ id, courseId, authorId: user.id, title, body }),
  ]);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/instructor");
  revalidatePath("/instructor/messages");
  return ok({ id });
}

const deleteInput = z.object({ id: z.uuid() });

export async function deleteAnnouncement(raw: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That announcement can't be found.");

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const found = await announcementForStaff(parsed.data.id, user);
  if (!found) return fail("not_found", "That announcement doesn't exist or isn't in a course you teach.");

  await db.batch([
    auditInsert({ actorId: user.id, action: "announcement.delete", entityType: "announcement", entityId: found.id, data: { courseId: found.courseId } }),
    deleteAnnouncementStatement(found.id),
  ]);
  revalidatePath(`/courses/${found.courseId}`);
  revalidatePath("/instructor/messages");
  return ok();
}
