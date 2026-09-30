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
  lessons,
  modules,
  sections,
  terms,
  videos,
  type User,
} from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { confirmsCourse, courseDeleteContents, courseDeleteRefusal } from "@/lib/courses/delete";
import { ADDABLE_LESSON_KINDS, TYPE_CHANGE_REFUSAL } from "@/lib/courses/lessons";
import { publishLessonWithContent } from "@/lib/courses/publish";
import { deleteLessonChunks } from "@/lib/db/chunks";
import { lessonsHaveStudentWork, moduleHasStudentWork } from "@/lib/db/assignments";
import { lessonInUse } from "@/lib/db/course-builder";
import { courseDeleteFacts, deleteUnusedCourse } from "@/lib/db/course-delete";
import { lessonLeftovers, type LessonLeftovers, type LessonScope } from "@/lib/db/lesson-cleanup";
import { cancelJob } from "@/lib/jobs";
import { deleteBlobs } from "@/lib/storage/blob";
import { blobPaths } from "@/lib/storage/upload-kinds";
import { safeAction } from "@/lib/utils/safe-action";
import { lessonHasReadyVideo } from "@/lib/video/lessons";
import { videoFileProblem } from "@/lib/video/upload-check";

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

export const createCourse = safeAction("createCourse", async (input: z.input<typeof newCourseSchema>): Promise<ActionResult<{ id: string }>> => {
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
});

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

export const updateCourseDetails = safeAction("updateCourseDetails", async (input: z.input<typeof courseDetailsSchema>): Promise<ActionResult> => {
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
});

const statusSchema = z.object({ id, published: z.boolean() });

export const setCoursePublished = safeAction("setCoursePublished", async (input: z.input<typeof statusSchema>): Promise<ActionResult> => {
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
});

/* The draft banner's shortcut (feature 27): the course and every module
   in one go. Lessons stay as they are; each is published on its own, with
   its content. */
export const publishCourseWithModules = safeAction("publishCourseWithModules", async (input: { courseId: string }): Promise<ActionResult> => {
  const parsed = z.object({ courseId: id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(parsed.data.courseId);
  if (isFailure(staff)) return staff;

  await db.batch([
    db.update(courses).set({ status: "published" }).where(eq(courses.id, staff.courseId)),
    db.update(modules).set({ status: "published" }).where(eq(modules.courseId, staff.courseId)),
    auditInsert({ actorId: staff.user.id, action: "course.published_with_modules", entityType: "course", entityId: staff.courseId }),
  ]);
  refresh(staff.courseId);
  return ok();
});

/* ---- Modules ------------------------------------------------------------- */

export const addModule = safeAction("addModule", async (input: { courseId: string; title: string }): Promise<ActionResult> => {
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
});

export const renameModule = safeAction("renameModule", async (input: { id: string; title: string }): Promise<ActionResult> => {
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
});

export const setModulePublished = safeAction("setModulePublished", async (input: z.input<typeof statusSchema>): Promise<ActionResult> => {
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
});

export const deleteModule = safeAction("deleteModule", async (input: { id: string }): Promise<ActionResult> => {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.id));
  if (isFailure(staff)) return staff;
  if (await moduleHasStudentWork(parsed.data.id)) return fail("conflict", STUDENT_WORK_MESSAGE);

  // Lessons go with it (FK cascade); their runs and files are cleaned up around the delete.
  const leftovers = await stopLessonRuns({ moduleId: parsed.data.id });
  await db.batch([
    db.delete(modules).where(eq(modules.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "module.delete", entityType: "module", entityId: parsed.data.id }),
  ]);
  await deleteLessonFiles(leftovers);
  await renumber("modules", staff.courseId);
  refresh(staff.courseId);
  return ok();
});

export const moveModule = safeAction("moveModule", async (input: { id: string; direction: "up" | "down" }): Promise<ActionResult> => {
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
});

/* ---- Lessons ------------------------------------------------------------- */

/* Returns the new lesson's id: the builder opens its editor straight away
   (feature 27). Quiz is no longer offered (ADDABLE_LESSON_KINDS). */
export const addLesson = safeAction("addLesson", async (input: { moduleId: string; title: string; kind: string }): Promise<ActionResult<{ id: string }>> => {
  const parsed = z.object({ moduleId: id, title, kind: z.enum(ADDABLE_LESSON_KINDS) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.moduleId));
  if (isFailure(staff)) return staff;

  const lessonId = crypto.randomUUID();
  await db.batch([insertLesson(lessonId, parsed.data), lessonCreatedAudit(staff.user.id, lessonId, parsed.data)]);
  refresh(staff.courseId);
  return ok({ id: lessonId });
});

type NewLesson = { moduleId: string; title: string; kind: (typeof ADDABLE_LESSON_KINDS)[number] };

function insertLesson(lessonId: string, l: NewLesson) {
  return db.insert(lessons).values({
    id: lessonId,
    moduleId: l.moduleId,
    title: l.title,
    kind: l.kind,
    position: sql`(select coalesce(max(position), -1) + 1 from lessons where module_id = ${l.moduleId})`,
  });
}

function lessonCreatedAudit(actorId: string, lessonId: string, l: NewLesson) {
  return auditInsert({ actorId, action: "lesson.create", entityType: "lesson", entityId: lessonId, data: { title: l.title, kind: l.kind } });
}

const videoFile = z.object({ name: z.string().max(300), size: z.number().int().nonnegative(), type: z.string().max(100) });

/* "Upload lecture" on a module (feature 27): checks the file, then makes
   the video lesson and the videos row the upload is recorded against, in
   one batch. The dialog then uploads straight to Blob and opens the new
   lesson's editor once processing has started. A file that fails the
   check leaves nothing behind. */
export const startLectureUpload = safeAction("startLectureUpload", async (input: {
  moduleId: string;
  title: string;
  file: z.input<typeof videoFile>;
}): Promise<ActionResult<{ lessonId: string; videoId: string; pathname: string }>> => {
  const parsed = z.object({ moduleId: id, title, file: videoFile }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const problem = videoFileProblem(parsed.data.file);
  if (problem) return fail("invalid", problem);
  const staff = await asCourseStaff(await courseIdForModule(parsed.data.moduleId));
  if (isFailure(staff)) return staff;

  const lesson: NewLesson = { moduleId: parsed.data.moduleId, title: parsed.data.title, kind: "video" };
  const lessonId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  const { name, size } = parsed.data.file;
  await db.batch([
    insertLesson(lessonId, lesson),
    db.insert(videos).values({ id: videoId, lessonId, createdBy: staff.user.id, status: "uploading" }),
    lessonCreatedAudit(staff.user.id, lessonId, lesson),
    auditInsert({ actorId: staff.user.id, action: "video.upload_started", entityType: "lesson", entityId: lessonId, data: { videoId, name, size } }),
  ]);
  refresh(staff.courseId);
  return ok({ lessonId, videoId, pathname: blobPaths.videoSource(lessonId) });
});

/* Change type (feature 27, V5): only while the lesson is empty. The check
   is in the UPDATE itself, so a video or document that lands meanwhile
   wins. A lesson that becomes a Video lesson goes back to draft: it can't
   be published without its video. */
export const changeLessonType = safeAction("changeLessonType", async (input: { id: string; kind: string }): Promise<ActionResult> => {
  const parsed = z.object({ id, kind: z.enum(ADDABLE_LESSON_KINDS) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;

  const [before] = await db.select({ kind: lessons.kind }).from(lessons).where(eq(lessons.id, parsed.data.id));
  if (!before) return fail("not_found", "That lesson no longer exists. Reload the page.");
  if (before.kind === parsed.data.kind) return ok();

  const toVideo = parsed.data.kind === "video";
  const changed = await db
    .update(lessons)
    .set({ kind: parsed.data.kind, ...(toVideo ? { status: "draft" as const, publishedAt: null } : {}) })
    .where(and(eq(lessons.id, parsed.data.id), sql`not ${lessonInUse}`))
    .returning({ id: lessons.id });
  if (changed.length === 0) return fail("conflict", TYPE_CHANGE_REFUSAL);
  await auditInsert({
    actorId: staff.user.id,
    action: "lesson.change_type",
    entityType: "lesson",
    entityId: parsed.data.id,
    data: { from: before.kind, to: parsed.data.kind },
  });
  refresh(staff.courseId);
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${parsed.data.id}`);
  return ok();
});

export const renameLesson = safeAction("renameLesson", async (input: { id: string; title: string }): Promise<ActionResult> => {
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
});

/* Publish is the review screen's Publish (feature 27): the lesson and its
   drafted notes, flashcards and quiz go live together, and a video lesson
   needs a ready video. The builder asks for confirmation first. */
export const setLessonPublished = safeAction("setLessonPublished", async (input: z.input<typeof statusSchema>): Promise<ActionResult> => {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;

  if (parsed.data.published) {
    const published = await publishLessonWithContent(parsed.data.id, staff.user.id, "builder");
    if (!published.ok) return published;
    refresh(staff.courseId);
    return ok();
  }

  // Unpublishing a lesson whose video is processed returns it to "ready",
  // not "draft", so the builder still shows the work is done.
  const hasVideo = await lessonHasReadyVideo(parsed.data.id);
  const status = hasVideo ? ("ready" as const) : ("draft" as const);
  await db.batch([
    db.update(lessons).set({ status, publishedAt: null }).where(and(eq(lessons.id, parsed.data.id), eq(lessons.status, "published"))),
    // Unpublish takes the lesson out of the assistant's index too.
    deleteLessonChunks(parsed.data.id),
    auditInsert({ actorId: staff.user.id, action: `lesson.${status}`, entityType: "lesson", entityId: parsed.data.id }),
  ]);
  refresh(staff.courseId);
  return ok();
});

export const deleteLesson = safeAction("deleteLesson", async (input: { id: string }): Promise<ActionResult> => {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(await courseIdForLesson(parsed.data.id));
  if (isFailure(staff)) return staff;
  if (await lessonsHaveStudentWork([parsed.data.id])) return fail("conflict", STUDENT_WORK_MESSAGE);

  const [lesson] = await db.select({ moduleId: lessons.moduleId }).from(lessons).where(eq(lessons.id, parsed.data.id));
  const leftovers = await stopLessonRuns({ lessonId: parsed.data.id });
  await db.batch([
    db.delete(lessons).where(eq(lessons.id, parsed.data.id)),
    auditInsert({ actorId: staff.user.id, action: "lesson.delete", entityType: "lesson", entityId: parsed.data.id }),
  ]);
  await deleteLessonFiles(leftovers);
  if (lesson) await renumber("lessons", lesson.moduleId);
  refresh(staff.courseId);
  return ok();
});

/* Deleting lessons (feature 26), in deleteNote's order: collect their
   Blob files and unfinished runs, cancel the runs so they stop spending
   and don't write to deleted rows, then (after the caller deletes the
   rows) delete the files, best effort. */
async function stopLessonRuns(scope: LessonScope): Promise<LessonLeftovers> {
  const leftovers = await lessonLeftovers(scope);
  await Promise.all(leftovers.jobs.map(cancelJob));
  return leftovers;
}

async function deleteLessonFiles(leftovers: LessonLeftovers): Promise<void> {
  await deleteBlobs(leftovers.blobUrls).catch((err) => console.warn("[builder] lesson files not deleted", err));
}

export const moveLesson = safeAction("moveLesson", async (input: { id: string; direction: "up" | "down" }): Promise<ActionResult> => {
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
});

/* ---- Deleting a course (feature 35) ----------------------------------------
   Only a course nobody depends on: no active student, no handed-in work,
   no pending invitation (lib/courses/delete.ts). Otherwise it's
   unpublished. The Delete dialog asks first (courseDeleteCheck), then
   deleteCourse checks again, in the delete statement itself. */

type DeleteCheck = { refusal: string | null; contents: string[] };

export const courseDeleteCheck = safeAction("courseDeleteCheck", async (input: { courseId: string }): Promise<ActionResult<DeleteCheck>> => {
  const parsed = z.object({ courseId: id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(parsed.data.courseId);
  if (isFailure(staff)) return staff;
  const facts = await courseDeleteFacts(staff.courseId);
  if (!facts) return fail("not_found", "That course doesn't exist or isn't yours to edit.");
  return ok({ refusal: courseDeleteRefusal(facts), contents: courseDeleteContents(facts) });
});

export const deleteCourse = safeAction("deleteCourse", async (input: { courseId: string; confirm: string }): Promise<ActionResult> => {
  const parsed = z.object({ courseId: id, confirm: z.string().max(100) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asCourseStaff(parsed.data.courseId);
  if (isFailure(staff)) return staff;
  const facts = await courseDeleteFacts(staff.courseId);
  if (!facts) return fail("not_found", "That course was already deleted.");
  if (!confirmsCourse(parsed.data.confirm, facts.code)) return fail("invalid", `Type the course code, ${facts.code}, to confirm.`);
  const refusal = courseDeleteRefusal(facts);
  if (refusal) return fail("conflict", refusal);

  // Same order as deleting a module (feature 26): stop the runs, delete the rows, then the files.
  const leftovers = await stopLessonRuns({ courseId: staff.courseId });
  const deleted = await deleteUnusedCourse({
    courseId: staff.courseId,
    actorId: staff.user.id,
    data: { modules: facts.modules, lessons: facts.lessons, files: leftovers.blobUrls.length, runsCancelled: leftovers.jobs.length },
  });
  if (!deleted) {
    // A student was enrolled or work handed in since the check.
    const now = await courseDeleteFacts(staff.courseId);
    return fail("conflict", (now && courseDeleteRefusal(now)) ?? "This course changed while it was being deleted. Try again.");
  }
  await deleteLessonFiles(leftovers);
  refresh(staff.courseId);
  for (const path of ["/instructor", "/catalog", "/courses", "/", "/calendar", "/admin/courses"]) revalidatePath(path);
  return ok();
});

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
