import { after } from "next/server";
import { z } from "zod";
import { answer, answerStream, courseForQuestion, QUESTION_LIMIT, QUESTION_LIMIT_MESSAGE } from "@/lib/ai/assistant";
import { checkCountedBudget } from "@/lib/ai/budget";
import { backgroundUsageWrites } from "@/lib/ai/usage";
import { getCurrentUser } from "@/lib/auth";
import { reserveQuestion } from "@/lib/db/chat";

/* The course assistant's streaming endpoint (feature 14).

   zod body → signed in → the course (and lesson) must be visible to this
   user, checked in SQL by getCourseForUser: enrolled students see only
   published lessons, staff see all. Anything else is a 404, like the
   pages. Then the daily AI limit (lib/ai/budget), and the question is
   saved only if it's under the question limit, in one locked batch
   (reserveQuestion, feature 25). The answer streams back as NDJSON (see
   answerStream in lib/ai/assistant.ts): thread, deltas, reset, then done
   or error.

   Before the first word (feature 29): the user lookup, then the course
   check with the day's AI usage counted in the same batch (one round
   trip; two parallel requests would open a second connection), then the
   question's locked batch. The question is saved inside that batch on
   purpose: the limit can't be raced otherwise (feature 25). The ai_usage
   rows are written in the background and finished in after(). */

const body = z.object({
  courseId: z.uuid(),
  /* Set to ask about one lesson; left out for the whole course. */
  lessonId: z.uuid().optional(),
  threadId: z.uuid().optional(),
  question: z.string().trim().min(1, "Type a question first.").max(1000, "Keep the question under 1,000 characters."),
  mode: z.enum(["answer", "where"]).default("answer"),
});

const json = (status: number, message: string) => Response.json({ error: message }, { status });

/* Vercel Hobby's ceiling. The answer itself stops at ANSWER_TIME_LIMIT_MS
   (240 s) with "That took too long. Try again.", well before this cuts
   the stream (feature 30). */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  // Same-origin only (CSRF): a page on another site can't ask as this user.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json(403, "Forbidden.");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, "That request wasn't valid.");
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? "That request wasn't valid.");
  const { courseId, lessonId, question, mode } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return json(401, "Your session has ended. Sign in again.");

  const { course, usage } = await courseForQuestion(courseId, user);
  const lessonIds = course?.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? [];
  if (!course || (lessonId && !lessonIds.includes(lessonId))) return json(404, "Not found.");

  const budget = await checkCountedBudget(user, { feature: "assistant", entityType: "course", entityId: courseId }, usage);
  if (!budget.ok) return json(429, budget.message);
  const reserved = await reserveQuestion({
    scope: { userId: user.id, courseId, lessonId: lessonId ?? null },
    threadId: parsed.data.threadId,
    question,
    limit: QUESTION_LIMIT,
  });
  if (!reserved) return json(429, QUESTION_LIMIT_MESSAGE);
  const { threadId, history } = reserved;

  const usageWrites = backgroundUsageWrites();
  after(usageWrites.settled);
  return answerStream(
    threadId,
    (on) =>
      usageWrites.run(() =>
        answer({
          user,
          subject: { kind: "course", id: course.course.id, title: course.course.title, lessonIds },
          scope: lessonId ? { lessonId } : { courseId },
          threadId,
          question,
          history,
          mode,
          onDelta: on.delta,
          onReset: on.reset,
          signal: on.signal,
        }),
      ),
    { route: "/api/assistant", userId: user.clerkId },
  );
}
