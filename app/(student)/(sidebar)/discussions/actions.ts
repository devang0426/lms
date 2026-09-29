"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { getCourseAccess, getLessonForUser } from "@/lib/db/courses";
import { markAnswerStatements, replyStatements, startDiscussionStatement, threadAccess, type ThreadAccess } from "@/lib/db/discussions";
import { DISCUSSION_LIMITS, discussionHref } from "@/lib/discussions/view";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Course discussions (feature 21), shared by the student's /discussions,
   the lesson player's Discussion tab, "Ask your instructor" and the
   instructor's Messages. Each: zod → signed in → the thread or course is
   visible to this viewer (in SQL) → the write, its notification and its
   audit row in one batch. Audit rows carry ids only. */

const title = z
  .string()
  .trim()
  .min(3, "Give your question a short title.")
  .max(DISCUSSION_LIMITS.title, `Keep the title under ${DISCUSSION_LIMITS.title} characters.`);
const body = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(DISCUSSION_LIMITS.body, `Keep it under ${DISCUSSION_LIMITS.body.toLocaleString("en-GB")} characters.`);

function revalidateThread(thread: Pick<ThreadAccess, "id" | "courseId" | "lessonId">) {
  revalidatePath("/discussions");
  revalidatePath(`/discussions/${thread.id}`);
  revalidatePath("/instructor");
  revalidatePath("/instructor/messages");
  revalidatePath(`/instructor/messages/${thread.id}`);
  if (thread.lessonId) revalidatePath(`/courses/${thread.courseId}/lessons/${thread.lessonId}`);
}

const startInput = z.object({ courseId: z.uuid(), lessonId: z.uuid().nullable(), title, body });

/* Start a thread in a course the viewer is in, optionally about a lesson
   they can open. Returns where the thread opens for them. */
export async function startDiscussion(raw: z.input<typeof startInput>): Promise<ActionResult<{ id: string; href: string }>> {
  const parsed = startInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check your question and try again.");
  const { courseId, lessonId, ...post } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  if (!(await getCourseAccess(courseId, user))) return fail("not_found", "That course doesn't exist or isn't one of yours.");
  if (lessonId) {
    const lesson = await getLessonForUser(lessonId, user);
    if (!lesson || lesson.course.id !== courseId) return fail("not_found", "That lesson doesn't exist or isn't open to you.");
  }

  const id = crypto.randomUUID();
  await db.batch([
    startDiscussionStatement({ id, courseId, lessonId, authorId: user.id, ...post }),
    auditInsert({ actorId: user.id, action: "discussion.start", entityType: "discussion", entityId: id, data: { courseId, lessonId } }),
  ]);
  revalidateThread({ id, courseId, lessonId });
  return ok({ id, href: discussionHref(id, user.role) });
}

const replyInput = z.object({ discussionId: z.uuid(), body, markAnswer: z.boolean().default(false) });

/* Reply to a thread the viewer can read. Staff may reply "as the answer",
   which marks it and answers the thread. The thread's author is notified
   unless they wrote the reply. */
export async function replyToDiscussion(raw: z.input<typeof replyInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = replyInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check your reply and try again.");
  const { discussionId, markAnswer } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const thread = await threadAccess(user, discussionId);
  if (!thread) return fail("not_found", "That discussion doesn't exist or isn't open to you.");

  const id = crypto.randomUUID();
  const answered = markAnswer && thread.viewerIsStaff;
  await db.batch([
    auditInsert({
      actorId: user.id,
      action: "discussion.reply",
      entityType: "discussion",
      entityId: discussionId,
      data: { replyId: id, markedAnswer: answered },
    }),
    ...replyStatements({ id, thread, author: { id: user.id, name: user.name }, body: parsed.data.body, markAnswer: answered }),
  ]);
  revalidateThread(thread);
  return ok({ id });
}

const answerInput = z.object({ discussionId: z.uuid(), replyId: z.uuid().nullable() });

/* Staff mark a reply as the answer (or clear it with null). */
export async function setAnswer(raw: z.input<typeof answerInput>): Promise<ActionResult> {
  const parsed = answerInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", "Pick a reply to mark.");
  const { discussionId, replyId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const thread = await threadAccess(user, discussionId);
  if (!thread) return fail("not_found", "That discussion doesn't exist or isn't open to you.");
  if (!thread.viewerIsStaff) return fail("unauthorized", "Only the course's instructors can mark the answer.");

  await db.batch([
    auditInsert({ actorId: user.id, action: replyId ? "discussion.answer" : "discussion.unanswer", entityType: "discussion", entityId: discussionId, data: { replyId } }),
    ...markAnswerStatements(discussionId, replyId),
  ]);
  revalidateThread(thread);
  return ok();
}
