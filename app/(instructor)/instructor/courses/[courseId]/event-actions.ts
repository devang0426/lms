"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { getCourseAccess } from "@/lib/db/courses";
import { addEventStatement, deleteEventStatement, manualEvent, MANUAL_EVENT_KINDS } from "@/lib/db/events";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Calendar events staff add by hand (feature 21): a live session (a link
   to the meeting, which runs elsewhere) or any other dated event. Due
   dates and graded quizzes come from their own forms. zod → course staff
   → the write and its audit row in one batch. */

const link = z
  .string()
  .trim()
  .max(2000, "That link is too long.")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Paste a full link starting with https://.");

const addInput = z
  .object({
    courseId: z.uuid(),
    kind: z.enum(MANUAL_EVENT_KINDS),
    title: z.string().trim().min(2, "Give the event a title.").max(140, "Keep the title under 140 characters."),
    /* ISO time from the browser, so the instructor's time zone is kept. */
    at: z.iso.datetime({ offset: true, message: "Pick a date and time." }),
    url: link.nullable(),
  })
  .refine((v) => v.kind !== "live" || v.url !== null, { message: "A live session needs its meeting link.", path: ["url"] });

export async function addCourseEvent(raw: z.input<typeof addInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = addInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the event and try again.");
  const { courseId, kind, title, url } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if ((await getCourseAccess(courseId, user)) !== "staff") return fail("not_found", "That course doesn't exist or isn't one you teach.");

  const id = crypto.randomUUID();
  const at = new Date(parsed.data.at);
  await db.batch([
    addEventStatement({ id, courseId, kind, title, at, url, createdBy: user.id }),
    auditInsert({ actorId: user.id, action: "event.add", entityType: "event", entityId: id, data: { courseId, kind, at: at.toISOString() } }),
  ]);
  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return ok({ id });
}

const deleteInput = z.object({ courseId: z.uuid(), eventId: z.uuid() });

export async function deleteCourseEvent(raw: z.input<typeof deleteInput>): Promise<ActionResult> {
  const parsed = deleteInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That event can't be found.");
  const { courseId, eventId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if ((await getCourseAccess(courseId, user)) !== "staff") return fail("not_found", "That course doesn't exist or isn't one you teach.");
  if (!(await manualEvent(eventId, courseId))) return fail("not_found", "That event is gone, or it comes from an assignment or quiz.");

  await db.batch([
    deleteEventStatement(eventId, courseId),
    auditInsert({ actorId: user.id, action: "event.delete", entityType: "event", entityId: eventId, data: { courseId } }),
  ]);
  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return ok();
}
