"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { enrollments, sections, users } from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* Roster changes (admin only). Removing a student marks the enrollment
   dropped rather than deleting it, so the history stays auditable. */

const enrollSchema = z.object({ courseId: z.uuid(), userId: z.uuid(), sectionId: z.uuid() });
const unenrollSchema = z.object({ courseId: z.uuid(), userId: z.uuid() });

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

function refresh(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}/enrollments`);
  revalidatePath("/admin/courses");
}

export const enrollStudent = safeAction("enrollStudent", async (input: z.input<typeof enrollSchema>): Promise<ActionResult> => {
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Pick a student and a section.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can change enrollments.");
  const { courseId, userId, sectionId } = parsed.data;

  const [[section], [student]] = await db.batch([
    db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.courseId, courseId))),
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)),
  ]);
  if (!section) return fail("not_found", "That section isn't part of this course.");
  if (student?.role !== "student") return fail("invalid", "Only student accounts can be enrolled.");

  await db.batch([
    db
      .insert(enrollments)
      .values({ sectionId, userId, status: "active" })
      .onConflictDoUpdate({
        target: [enrollments.sectionId, enrollments.userId],
        set: { status: "active", enrolledAt: new Date() },
      }),
    auditInsert({ actorId: admin.id, action: "enrollment.add", entityType: "course", entityId: courseId, data: { userId, sectionId } }),
  ]);
  refresh(courseId);
  return ok();
});

export const unenrollStudent = safeAction("unenrollStudent", async (input: z.input<typeof unenrollSchema>): Promise<ActionResult> => {
  const parsed = unenrollSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Pick a student to remove.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can change enrollments.");
  const { courseId, userId } = parsed.data;

  const courseSections = db.select({ id: sections.id }).from(sections).where(eq(sections.courseId, courseId));
  await db.batch([
    db
      .update(enrollments)
      .set({ status: "dropped" })
      .where(and(eq(enrollments.userId, userId), inArray(enrollments.sectionId, courseSections))),
    auditInsert({ actorId: admin.id, action: "enrollment.remove", entityType: "course", entityId: courseId, data: { userId } }),
  ]);
  refresh(courseId);
  return ok();
});
