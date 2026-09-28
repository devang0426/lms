import { z } from "zod";
import { answer } from "@/lib/ai/assistant";
import { EngineError } from "@/lib/ai/engine";
import { getCurrentUser } from "@/lib/auth";
import type { AssistantEvent } from "@/lib/chat/types";
import { addUserTurn, countRecentQuestions, ensureThread, listTurns } from "@/lib/db/chat";
import { getCourseForUser } from "@/lib/db/courses";

/* The course assistant's streaming endpoint (feature 14).

   zod body → signed in → the course (and lesson) must be visible to this
   user, checked in SQL by getCourseForUser: enrolled students see only
   published lessons, staff see all. Anything else is a 404, like the
   pages. Then the rate limit, the question is saved, and the answer
   streams back as NDJSON:
     {"type":"thread","threadId"}   first
     {"type":"delta","text"}        raw answer text as it arrives
     {"type":"reset"}               drop the text so far (a retry follows)
     {"type":"done","turn"}         the checked answer, which replaces the
                                    streamed text, with its citations
     {"type":"error","message"}     instead of done, if it failed */

const RATE_LIMIT = { questions: 20, minutes: 5 };

const body = z.object({
  courseId: z.uuid(),
  /* Set to ask about one lesson; left out for the whole course. */
  lessonId: z.uuid().optional(),
  threadId: z.uuid().optional(),
  question: z.string().trim().min(1, "Type a question first.").max(1000, "Keep the question under 1,000 characters."),
  mode: z.enum(["answer", "where"]).default("answer"),
});

const json = (status: number, message: string) => Response.json({ error: message }, { status });

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

  const course = await getCourseForUser(courseId, user);
  const lessonIds = course?.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? [];
  if (!course || (lessonId && !lessonIds.includes(lessonId))) return json(404, "Not found.");

  const scope = { userId: user.id, courseId, lessonId: lessonId ?? null };
  const [recent, threadId] = await Promise.all([
    countRecentQuestions(user.id, RATE_LIMIT.minutes),
    ensureThread(scope, parsed.data.threadId, question),
  ]);
  if (recent >= RATE_LIMIT.questions) {
    return json(429, `That's ${RATE_LIMIT.questions} questions in ${RATE_LIMIT.minutes} minutes. Take a short break and ask again.`);
  }
  const history = await listTurns(threadId, user.id);
  await addUserTurn(threadId, question);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "thread", threadId });
      try {
        const turn = await answer({
          user,
          course: { id: course.course.id, title: course.course.title, lessonIds },
          scope: lessonId ? { lessonId } : { courseId },
          threadId,
          question,
          history,
          mode,
          onDelta: (text) => send({ type: "delta", text }),
          onReset: () => send({ type: "reset" }),
        });
        send({ type: "done", turn });
      } catch (err) {
        console.error("[assistant] answer failed", err);
        send({ type: "error", message: friendly(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function friendly(err: unknown): string {
  if (err instanceof EngineError && (err.kind === "rate_limit" || err.kind === "quota")) {
    return "The assistant is busy right now. Try again in a minute.";
  }
  return "The assistant couldn't answer just now. Try again in a moment.";
}
