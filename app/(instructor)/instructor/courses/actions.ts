"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { courseIdForLesson, courseIdForModule, getCourseAccess } from "@/lib/db/courses";
import {
  COVER_TINTS,
  courses,
  courseStaff,
  LESSON_KINDS,
  lessons,
  modules,
  sections,
  terms,
  type User,
} from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { deleteLessonChunks } from "@/lib/db/chunks";
import { hasReadyDocuments } from "@/lib/db/documents";
import { lessonsHaveStudentWork, moduleHasStudentWork } from "@/lib/db/assignments";
import { lessonHasReadyVideo, startLessonIndexing } from "@/lib/video/lessons";

/* Course builder mutations. Each one: parse with zod → check course staff
   → write (with its audit_log row in the same batch) → revalidate. */

const id = z.uuid();
const title = z.string().trim().min(1, "Give it a title.").max(200, "Keep the title under 200 characters.");
const direction = z.enum(["up", "down"]);

type Staffed = { user: User; courseId: string };

async function asCourseStaff(courseId: string | null): Promise<Staffed | ActionResult<never>> {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if (!courseId || (await getCourseAccess(courseId, user)) !== "staff") {
    return fail("not_found", "That course doesn't exist or isn't yours to edit.");
  }
  return { user, courseId };
}

function isFailure(v: Staffed | ActionResult<never>): v is ActionResult<never> {
  return "ok" in v;
}

function invalid(error: z.ZodError): ActionResult<never> {
  return fail("invalid", error.issues[0]?.message ?? "Check the form and try again.");
}

/* Submissions and grades are kept for audit (feature 20), so a lesson or
   module with student work can't be deleted — the database refuses too. */
const STUDENT_WORK_MESSAGE =
  "Students have handed in work here (an assignment or a graded quiz), so it can't be deleted. Unpublish it instead.";

function refresh(courseId: string) {
  revalidatePath("/instructor/courses");
  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
}

/* ---- Courses ------------------------------------------------------------- */

const newCourseSchema = z.object({
  code: z.string().trim().min(1, "Add a course code, e.g. MATH 201.").max(20),
  title,
  subject: z.string().trim().max(60).default(""),
  level: z.string().trim().max(40).default(""),
});

export async function createCourse(input: z.input<typeof newCourseSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = newCourseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if (user.role !== "instructor" && user.role !== "admin") {
    return fail("unauthorized", "Only instructors can create courses.");
  }

  const [term] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
  if (!term) return fail("conflict", "There's no current term yet. Ask an admin to set one up.");

  const [clash] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.termId, term.id), eq(courses.code, parsed.data.code)))
    .limit(1);
  if (clash) return fail("conflict", `${parsed.data.code} already exists in ${term.name}.`);

  const courseId = crypto.randomUUID();
  await db.batch([
    db.insert(courses).values({ id: courseId, termId: term.id, ...parsed.data }),
    db.insert(sections).values({ courseId, name: "Section A" }),
    db.insert(courseStaff).values({ courseId, userId: user.id, role: "instructor" }),
    auditInsert({ actorId: user.id, action: "course.create", entityType: "course", entityId: courseId, data: parsed.data }),
  ]);
  refresh(courseId);
  return ok({ id: courseId });
}

const courseDetailsSchema = z.object({
  courseId: id,
  code: z.string().trim().min(1, "Add a course code.").max(20),
  title,
  subject: z.string().trim().max(60),
  level: z.string().trim().max(40),
  summary: z.string().trim().max(2000),
  outcomes: z.array(z.string().trim().min(1).max(200)).max(12, "Keep it to 12 outcomes or fewer."),
  coverTint: z.enum(COVER_TINTS),
});

export async function updateCourseDetails(input: z.input<typeof courseDetailsSchema>): Promise<ActionResult> {
  const parsed = courseDetailsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { courseId, ...values } = parsed.data;

  const staff = await asCourseStaff(courseId);
  if (isFailure(staff)) return staff;

  await db.batch([
    db.update(courses).set(values).where(eq(courses.id, courseId)),
    auditInsert({ actorId: staff.user.id, action: "course.update", entityType: "course", entityId: courseId, data: values }),
  ]);
  refresh(courseId);
  return ok();
}

const statusSchema = z.object({ id, published: z.boolean() });

export async function setCoursePublished(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(parsed.data.id);
  if (isFailure(staff)) return staff;

  const status = parsed.data.published ? "published" : "draft";
  await db.batch([
    db.update(courses).set({ status }).where(eq(courses.id, staff.courseId)),
    auditInsert({ actorId: staff.user.id, action: `course.${status}`, entityType: "course", entityId: staff.courseId }),
  ]);
  refresh(staff.courseId);
  return ok();
}

/* ---- Modules ------------------------------------------------------------- */

export async function addModule(input: { courseId: string; title: string }): Promise<ActionResult> {
  const parsed = z.object({ courseId: id, title }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(parsed.data.courseId);
  if (isFailure(staff)) return staff;

  const moduleId = crypto.randomUUID();
  await db.batch([
    db.insert(modules).values({
      id: moduleId,
      courseId: staff.courseId,
      title: parsed.data.title,
      position: sql`(select coalesce(max(position), -1) + 1 from modules where course_id = ${staff.courseId})`,
    }),
    auditInsert({ actorId: staff.user.id, action: "module.create", entityType: "module", entityId: moduleId, data: { title: parsed.data.title } }),
  ]);
  refresh(staff.courseId);
  return ok();
}

export async function renameModule(input: { id: string; title: string }): Promise<ActionResult> {
  const parsed = z.object({ id, title }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.id));
  if (isFailure(staff)) return staff;

  await db.batch([
    db.update(modules).set({ title: parsed.data.title }).where(eq(modules.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "module.rename", entityType: "module", entityId: parsed.data.id, data: { title: parsed.data.title } }),
  ]);
  refresh(staff.courseId);
  return ok();
}

export async function setModulePublished(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.id));
  if (isFailure(staff)) return staff;

  const status = parsed.data.published ? "published" : "draft";
  await db.batch([
    db.update(modules).set({ status }).where(eq(modules.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: `module.${status}`, entityType: "module", entityId: parsed.data.id }),
  ]);
  refresh(staff.courseId);
  return ok();
}

export async function deleteModule(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.id));
  if (isFailure(staff)) return staff;
  if (await moduleHasStudentWork(parsed.data.id)) return fail("conflict", STUDENT_WORK_MESSAGE);

  // Lessons go with it (FK cascade). Once lessons own Blob files (feature 10),
  // delete those first.
  await db.batch([
    db.delete(modules).where(eq(modules.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "module.delete", entityType: "module", entityId: parsed.data.id }),
  ]);
  await renumber("modules", staff.courseId);
  refresh(staff.courseId);
  return ok();
}

export async function moveModule(input: { id: string; direction: "up" | "down" }): Promise<ActionResult> {
  const parsed = z.object({ id, direction }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.id));
  if (isFailure(staff)) return staff;

  await renumber("modules", staff.courseId, parsed.data, {
    actorId: staff.user.id,
    action: `module.move_${parsed.data.direction}`,
    entityType: "module",
    entityId: parsed.data.id,
  });
  refresh(staff.courseId);
  return ok();
}

/* ---- Lessons ------------------------------------------------------------- */

export async function addLesson(input: { moduleId: string; title: string; kind: string }): Promise<ActionResult> {
  const parsed = z.object({ moduleId: id, title, kind: z.enum(LESSON_KINDS) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.moduleId));
  if (isFailure(staff)) return staff;

  const lessonId = crypto.randomUUID();
  await db.batch([
    db.insert(lessons).values({
      id: lessonId,
      moduleId: parsed.data.moduleId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      position: sql`(select coalesce(max(position), -1) + 1 from lessons where module_id = ${parsed.data.moduleId})`,
    }),
    auditInsert({
      actorId: staff.user.id,
      action: "lesson.create",
      entityType: "lesson",
      entityId: lessonId,
      data: { title: parsed.data.title, kind: parsed.data.kind },
    }),
  ]);
  refresh(staff.courseId);
  return ok();
}

export async function renameLesson(input: { id: string; title: string }): Promise<ActionResult> {
  const parsed = z.object({ id, title }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;

  await db.batch([
    db.update(lessons).set({ title: parsed.data.title }).where(eq(lessons.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "lesson.rename", entityType: "lesson", entityId: parsed.data.id, data: { title: parsed.data.title } }),
  ]);
  refresh(staff.courseId);
  return ok();
}

export async function setLessonPublished(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;

  const [lesson] = await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, parsed.data.id));
  if (lesson?.status === "processing") {
    return fail("conflict", "This lesson is still processing. Publish it once it's ready.");
  }

  // Unpublishing a lesson whose video is processed returns it to "ready",
  // not "draft", so the builder still shows the work is done.
  const hasVideo = await lessonHasReadyVideo(parsed.data.id);
  const unpublishedStatus = hasVideo ? ("ready" as const) : ("draft" as const);
  const set = parsed.data.published
    ? { status: "published" as const, publishedAt: new Date() }
    : { status: unpublishedStatus, publishedAt: null };
  await db.batch([
    db.update(lessons).set(set).where(eq(lessons.id, parsed.data.id)),
    // Unpublish takes the lesson out of the assistant's index too.
    ...(parsed.data.published ? [] : [deleteLessonChunks(parsed.data.id)]),
    auditInsert({ actorId: staff.user.id, action: `lesson.${set.status}`, entityType: "lesson", entityId: parsed.data.id }),
  ]);
  // Its transcript and documents go live with it, so the assistant indexes them now.
  if (parsed.data.published && (hasVideo || (await hasReadyDocuments(parsed.data.id)))) {
    await startLessonIndexing(parsed.data.id, staff.user.id);
  }
  refresh(staff.courseId);
  return ok();
}

export async function deleteLesson(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;
  if (await lessonsHaveStudentWork([parsed.data.id])) return fail("conflict", STUDENT_WORK_MESSAGE);

  const [lesson] = await db.select({ moduleId: lessons.moduleId }).from(lessons).where(eq(lessons.id, parsed.data.id));
  await db.batch([
    db.delete(lessons).where(eq(lessons.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "lesson.delete", entityType: "lesson", entityId: parsed.data.id }),
  ]);
  if (lesson) await renumber("lessons", lesson.moduleId);
  refresh(staff.courseId);
  return ok();
}

export async function moveLesson(input: { id: string; direction: "up" | "down" }): Promise<ActionResult> {
  const parsed = z.object({ id, direction }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;

  const [lesson] = await db.select({ moduleId: lessons.moduleId }).from(lessons).where(eq(lessons.id, parsed.data.id));
  if (lesson) {
    await renumber("lessons", lesson.moduleId, parsed.data, {
      actorId: staff.user.id,
      action: `lesson.move_${parsed.data.direction}`,
      entityType: "lesson",
      entityId: parsed.data.id,
    });
  }
  refresh(staff.courseId);
  return ok();
}

/* ---- Ordering ------------------------------------------------------------
   Load the siblings in order, optionally swap one with its neighbour, then
   write 0..n-1 back in a single batch (only rows that changed), with the
   move's audit row. Also closes the gaps a delete leaves behind. */

async function renumber(
  kind: "modules" | "lessons",
  parentId: string,
  move?: { id: string; direction: "up" | "down" },
  audit?: Parameters<typeof auditInsert>[0],
) {
  const table = kind === "modules" ? modules : lessons;
  const parent = kind === "modules" ? modules.courseId : lessons.moduleId;
  const rows = await db
    .select({ id: table.id, position: table.position })
    .from(table)
    .where(eq(parent, parentId))
    .orderBy(asc(table.position), asc(table.createdAt));

  const order = rows.map((r) => r.id);
  if (move) {
    const i = order.indexOf(move.id);
    const j = move.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
  }

  const updates = order.flatMap((rowId, position) =>
    rows.find((r) => r.id === rowId)?.position === position
      ? []
      : [db.update(table).set({ position }).where(eq(table.id, rowId))],
  );
  const [first, ...rest] = updates;
  if (first) await db.batch([first, ...rest, ...(audit ? [auditInsert(audit)] : [])]);
}
