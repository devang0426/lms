"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkBudget } from "@/lib/ai/budget";
import type { Block } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/auth";
import { publishLessonWithContent } from "@/lib/courses/publish";
import { auditInsert } from "@/lib/db/audit";
import { courseIdForLesson, getCourseAccess } from "@/lib/db/courses";
import {
  addCard,
  addChapter,
  deleteCard,
  deleteChapter,
  deleteQuestion,
  loadDraftSource,
  updateCard,
  updateChapter,
  updateNoteBlocks,
  updateQuestion,
} from "@/lib/db/lesson-content";
import { QUIZ_BANKS, QUIZ_DIFFICULTIES, type User } from "@/lib/db/schema";
import { startJob } from "@/lib/jobs";
import { markdownToBlocks } from "@/lib/markdown";
import { parseT } from "@/lib/time";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* Review screen (feature 12). Every action: zod → course staff for the
   lesson → write (edits scoped to the lesson in the query) → revalidate.
   Regenerating and publishing are audited; small edits are not. */

type Staffed = { user: User; courseId: string; lessonId: string };

async function asLessonStaff(lessonId: string): Promise<Staffed | ActionResult<never>> {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const courseId = await courseIdForLesson(lessonId);
  if (!courseId || (await getCourseAccess(courseId, user)) !== "staff") {
    return fail("not_found", "That lesson doesn't exist or isn't yours to edit.");
  }
  return { user, courseId, lessonId };
}

const reviewPath = (s: Staffed) => `/instructor/courses/${s.courseId}/lessons/${s.lessonId}/review`;
const done = (s: Staffed) => {
  revalidatePath(reviewPath(s));
  return ok();
};
const missing = () => fail("not_found", "That item no longer exists. Reload the page.");
const invalid = (e: z.ZodError) => fail("invalid", e.issues[0]?.message ?? "Check the fields and try again.");

const lessonId = z.uuid();
const itemId = z.uuid();
const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} can't be empty.`).max(max, `${label} is too long (${max} characters at most).`);
/* "12:48", "768" or "12m48s" → seconds. */
const time = z
  .string()
  .transform((v, ctx) => {
    const sec = parseT(v);
    if (sec === null) {
      ctx.addIssue({ code: "custom", message: "Write the time as mm:ss, e.g. 12:48." });
      return z.NEVER;
    }
    return sec;
  });

/* ---- Chapters -------------------------------------------------------------- */

const chapterFields = z.object({ title: text("The title", 120), start: time, summary: z.string().trim().max(600) });

export const saveChapter = safeAction("saveChapter", async (input: { lessonId: string; id: string; title: string; start: string; summary: string }): Promise<ActionResult> => {
  const parsed = chapterFields.extend({ lessonId, id: itemId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  const { title, start, summary } = parsed.data;
  if (!(await updateChapter(staff.lessonId, parsed.data.id, { title, startSec: start, summary }))) return missing();
  return done(staff);
});

export const createChapter = safeAction("createChapter", async (input: { lessonId: string; title: string; start: string; summary: string }): Promise<ActionResult> => {
  const parsed = chapterFields.extend({ lessonId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  await addChapter(staff.lessonId, { title: parsed.data.title, startSec: parsed.data.start, summary: parsed.data.summary });
  return done(staff);
});

export const removeChapter = safeAction("removeChapter", async (input: { lessonId: string; id: string }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, id: itemId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  if (!(await deleteChapter(staff.lessonId, parsed.data.id))) return missing();
  return done(staff);
});

/* ---- Notes ----------------------------------------------------------------- */

/* The block editor sends each block as Markdown (blocksToMarkdown of one
   block) plus its video time; parsing happens here, so the editor needs
   no Markdown code. A time is kept on the block's first heading. */
const noteItem = z.object({
  markdown: z.string().max(20_000),
  startSec: z.number().finite().min(0).max(24 * 3600).nullable(),
});

export const saveNote = safeAction("saveNote", async (input: { lessonId: string; items: z.input<typeof noteItem>[] }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, items: z.array(noteItem).max(2000) }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Those notes couldn't be saved. Reload and try again.");
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  const blocks: Block[] = parsed.data.items.flatMap(({ markdown, startSec }) => {
    const parsedBlocks = markdownToBlocks(markdown);
    const heading = parsedBlocks.find((b) => b.type.startsWith("heading"));
    if (heading && startSec !== null) heading.startSec = startSec;
    return parsedBlocks;
  });
  if (!(await updateNoteBlocks(staff.lessonId, blocks))) return missing();
  return done(staff);
});

/* ---- Flashcards ------------------------------------------------------------ */

const cardFields = z.object({ front: text("The front", 500), back: text("The back", 1500), topic: z.string().trim().max(80) });

export const saveCard = safeAction("saveCard", async (input: { lessonId: string; id: string; front: string; back: string; topic: string }): Promise<ActionResult> => {
  const parsed = cardFields.extend({ lessonId, id: itemId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  const { front, back, topic } = parsed.data;
  if (!(await updateCard(staff.lessonId, parsed.data.id, { front, back, topic }))) return missing();
  return done(staff);
});

export const createCard = safeAction("createCard", async (input: { lessonId: string; front: string; back: string; topic: string }): Promise<ActionResult> => {
  const parsed = cardFields.extend({ lessonId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  await addCard(staff.lessonId, { front: parsed.data.front, back: parsed.data.back, topic: parsed.data.topic });
  return done(staff);
});

export const removeCard = safeAction("removeCard", async (input: { lessonId: string; id: string }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, id: itemId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  if (!(await deleteCard(staff.lessonId, parsed.data.id))) return missing();
  return done(staff);
});

/* ---- Quiz ------------------------------------------------------------------ */

const questionFields = z
  .object({
    type: z.enum(["mcq", "true_false", "fill_blank"]),
    question: text("The question", 1000),
    options: z.array(z.string().trim().min(1, "Options can't be empty.").max(500)).min(1).max(4),
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().max(1500),
    topic: z.string().trim().max(80),
    difficulty: z.enum(QUIZ_DIFFICULTIES),
    bank: z.enum(QUIZ_BANKS),
  })
  .superRefine((q, ctx) => {
    const need = { mcq: 4, true_false: 2, fill_blank: 1 }[q.type];
    if (q.options.length !== need) ctx.addIssue({ code: "custom", message: `This question type needs ${need} option(s).` });
    if (q.correctIndex >= q.options.length) ctx.addIssue({ code: "custom", message: "Pick the correct answer." });
    if (q.type === "fill_blank" && !q.question.includes("___")) {
      ctx.addIssue({ code: "custom", message: "Mark the blank in the question with ___." });
    }
  });

export const saveQuestion = safeAction("saveQuestion", async (input: { lessonId: string; id: string } & z.input<typeof questionFields>): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, id: itemId }).and(questionFields).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  const { question, options, correctIndex, explanation, topic, bank, difficulty } = parsed.data;
  const saved = await updateQuestion(staff.lessonId, parsed.data.id, { question, options, correctIndex, explanation, topic, bank, difficulty });
  if (!saved) return missing();
  return done(staff);
});

export const removeQuestion = safeAction("removeQuestion", async (input: { lessonId: string; id: string }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, id: itemId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  if (!(await deleteQuestion(staff.lessonId, parsed.data.id))) return missing();
  return done(staff);
});

/* ---- Regenerate and publish -------------------------------------------------- */

const KINDS = ["chapters", "notes", "cards", "quiz"] as const;

/* Redraft one tab. Replaces that tab's items (edits included) with new
   drafts; the review page shows the run's progress. Within the daily AI
   limit of whoever presses it, who is charged for the run (feature 25). */
export const regenerate = safeAction("regenerate", async (input: { lessonId: string; kind: (typeof KINDS)[number] }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId, kind: z.enum(KINDS) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  if (!(await loadDraftSource(staff.lessonId))) {
    return fail("invalid", "Upload the video and let it finish processing (or, for a reading lesson, add a document) first.");
  }
  const budget = await checkBudget(staff.user, { feature: "regenerate", entityType: "lesson", entityId: staff.lessonId });
  if (!budget.ok) return fail("conflict", budget.message);
  const { kind } = parsed.data;
  await startJob({
    kind: `generate-${kind}`,
    entity: { type: "lesson", id: staff.lessonId },
    payload: { lessonId: staff.lessonId, force: true, requestedBy: staff.user.id },
    createdBy: staff.user.id,
    idempotencyKey: `lesson:${staff.lessonId}:generate-${kind}:${Date.now()}`,
  });
  await auditInsert({ actorId: staff.user.id, action: `lesson.regenerate_${kind}`, entityType: "lesson", entityId: staff.lessonId });
  return done(staff);
});

/* The lesson and every generated item go live together, the same way the
   curriculum row's Publish does (publishLessonWithContent, feature 27). */
export const publishLesson = safeAction("publishLesson", async (input: { lessonId: string }): Promise<ActionResult> => {
  const parsed = z.object({ lessonId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = await asLessonStaff(parsed.data.lessonId);
  if ("ok" in staff) return staff;
  if (!(await loadDraftSource(staff.lessonId))) {
    return fail("invalid", "This lesson has no processed video or documents yet, so there's nothing to publish.");
  }
  const published = await publishLessonWithContent(staff.lessonId, staff.user.id, "review");
  if (!published.ok) return published;
  revalidatePath(`/instructor/courses/${staff.courseId}`);
  revalidatePath(`/instructor/courses/${staff.courseId}/lessons/${staff.lessonId}`);
  return done(staff);
});
