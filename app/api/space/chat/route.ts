import { z } from "zod";
import { answer, answerStream, QUESTION_LIMIT, QUESTION_LIMIT_MESSAGE } from "@/lib/ai/assistant";
import { checkBudget } from "@/lib/ai/budget";
import { getCurrentUser } from "@/lib/auth";
import { reserveQuestion } from "@/lib/db/chat";
import { getOwnedNote } from "@/lib/db/space";

/* The private space's chat (feature 19): a note's Chat tab. The same
   answer pipeline and NDJSON stream as the course assistant, over the
   student's own uploads — and, with "Include my courses", their enrolled
   courses too (the access filter in lib/db/chunks.ts still decides which
   course material they may see). It refuses anything outside that, with
   no model call when nothing relevant is found.

   zod body → signed in → the note must be the caller's own (anyone else,
   admins included, gets a 404) → the daily AI limit → the question is
   saved on the note's thread if it's under the shared question limit (one
   locked batch, feature 25) → the answer streams back. */

const body = z.object({
  noteId: z.uuid(),
  threadId: z.uuid().optional(),
  question: z.string().trim().min(1, "Type a question first.").max(1000, "Keep the question under 1,000 characters."),
  includeCourses: z.boolean().default(false),
});

const json = (status: number, message: string) => Response.json({ error: message }, { status });

/* Vercel Hobby's ceiling; the answer stops at 240 s first (answerStream,
   feature 30). */
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
  const { noteId, question, includeCourses } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return json(401, "Your session has ended. Sign in again.");
  if (!(await getOwnedNote(noteId, user.id))) return json(404, "Not found.");

  const budget = await checkBudget(user, { feature: "space-chat", entityType: "note", entityId: noteId });
  if (!budget.ok) return json(429, budget.message);
  const reserved = await reserveQuestion({ scope: { userId: user.id, noteId }, threadId: parsed.data.threadId, question, limit: QUESTION_LIMIT });
  if (!reserved) return json(429, QUESTION_LIMIT_MESSAGE);
  const { threadId, history } = reserved;

  return answerStream(
    threadId,
    (on) =>
      answer({
        user,
        subject: { kind: "space", withCourses: includeCourses },
        scope: includeCourses ? { ownerId: user.id, withCourses: true } : { ownerId: user.id },
        threadId,
        question,
        history,
        mode: "answer",
        onDelta: on.delta,
        onReset: on.reset,
        signal: on.signal,
      }),
    { route: "/api/space/chat", userId: user.clerkId },
  );
}
