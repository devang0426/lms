import "server-only";

import { EngineError, type ChatMessage } from "@/lib/ai/engine";
import { getEngine } from "@/lib/ai/engine/server";
import { assistantSources, assistantSystem, assistantUser, spaceAssistantSystem } from "@/lib/ai/prompts";
import { searchChunks, type SearchResult, type SearchScope } from "@/lib/ai/retrieval/search";
import { toUsageToday, usageTodayQuery, type AiUsageToday } from "@/lib/ai/budget";
import { withUsage } from "@/lib/ai/usage";
import { addAssistantTurn, segmentsInRanges } from "@/lib/db/chat";
import { db } from "@/lib/db/client";
import { courseForUserQueries, getCourseForUser, toCourseForUser, type CourseForUser, type Viewer } from "@/lib/db/courses";
import type { AssistantEvent, AssistantMode, ChatCitation, TurnView } from "@/lib/chat/types";
import type { ChatTurn } from "@/lib/db/schema";
import { bestMoment, checkAnswer, citationLabel, claimsFor, NOT_IN_SYLLABUS, releasable, stripMarkers } from "@/lib/chat/citations";
import { logServerError } from "@/lib/utils/server-error";

/* The course assistant (feature 14): explain, cite, jump — or refuse.

   1. Retrieve the course's chunks the user may see (searchChunks).
   2. Relevance gate: best similarity under ASSISTANT_MIN_SIMILARITY and no
      full-text hit → refuse with NO model call.
   3. Number the chunks as sources, each in <source> tags (feature 24):
      id "S1" from "Lecture 3 · 12:48", or
      from "Week 2 slides · p. 7" for a document (feature 18).
   4. Stream the answer from the fast tier (ai_usage feature "assistant").
   5. Refuse on the refusal token or when no valid [S#] is left; drop the
      rest of the invalid ones (lib/chat/citations.ts). An empty or
      uncited draft that isn't the token is retried once first.
   6. Map each citation to a chip, placed on the transcript line inside
      the chunk that best matches the claim.
   7. Save the assistant turn (the route saved the question).

   "Where was this taught?" mode skips 4–5 and returns the top three
   chunks as moments. The refusal wording is fixed UI text, not generated.

   The private space's chat (feature 19) is the same pipeline with another
   subject: the student's own uploads, plus their courses when they
   include them. Its sources are labelled by upload ("My slides · p. 7")
   or by course and lecture ("MATH 201 · Lecture 3 · 12:48"), its prompt
   is spaceAssistantSystem, and its cost is logged as "space-chat". */


export function toTurnView(t: ChatTurn): TurnView {
  return { id: t.id, role: t.role, content: t.content, citations: t.citations, refused: t.refused };
}

const DEFAULT_MIN_SIMILARITY = 0.25; // picked with npm run eval:retrieval (feature 13)
const K = 8;
const MOMENTS = 3;
const HISTORY_TURNS = 6;
const ANSWER_MAX_TOKENS = 4000; // fast-tier models may reason first
const ANSWER_ATTEMPTS = 2;

export function minSimilarity(): number {
  const v = Number.parseFloat(process.env.ASSISTANT_MIN_SIMILARITY ?? "");
  return Number.isFinite(v) && v > 0 && v < 1 ? v : DEFAULT_MIN_SIMILARITY;
}

/* True when the question is about something the course teaches. */
export function passesGate(results: SearchResult[], threshold = minSimilarity()): boolean {
  if (results.length === 0) return false;
  const best = Math.max(...results.map((r) => r.similarity));
  return best >= threshold || results.some((r) => r.ftsRank !== null);
}

/* What the assistant answers from. For a course, `lessonIds` are its
   lessons in order, as this user sees them ("Lecture n" in chip labels,
   the same numbering as the player's). */
export type AssistantSubject =
  | { kind: "course"; id: string; title: string; lessonIds: string[] }
  /* The student's private space (feature 19). */
  | { kind: "space"; withCourses: boolean };

export async function answer(input: {
  user: Viewer;
  subject: AssistantSubject;
  scope: SearchScope;
  threadId: string;
  question: string;
  history: ChatTurn[];
  mode: AssistantMode;
  onDelta?: (text: string) => void;
  /* The streamed draft is being thrown away and retried. */
  onReset?: () => void;
  /* The request's time limit (answerStream, feature 30): the model call
     stops, and nothing is saved after it. */
  signal?: AbortSignal;
}): Promise<TurnView> {
  const { user, subject, threadId, question, mode, signal } = input;
  const save = async (fields: { content: string; citations: ChatCitation[]; refused: boolean; ids: string[] }) => {
    signal?.throwIfAborted();
    return toTurnView(
      await addAssistantTurn({
        threadId,
        content: fields.content,
        citations: fields.citations,
        refused: fields.refused,
        retrievedChunkIds: fields.ids,
      }),
    );
  };

  // A follow-up ("and in 3D?") is searched together with the question before it.
  const previous = mode === "answer" ? [...input.history].reverse().find((t) => t.role === "user")?.content : undefined;
  const query = previous ? `${previous}\n${question}` : question;
  const results = await searchChunks({ userId: user.id, scope: input.scope, query, k: K });
  const ids = results.map((r) => r.chunk.id);

  if (!passesGate(results)) return save({ content: "", citations: [], refused: true, ids });

  const labels = await labelsFor(subject, results, user);
  const where = (r: SearchResult) => label(r, r.chunk.startSec, labels);

  if (mode === "where") {
    const top = results.slice(0, MOMENTS);
    const placed = await place(top, top.map(() => question));
    const citations = top.map((r, i) => ({ ...cite(r, placed[i].startSec, labels), snippet: placed[i].snippet }));
    return save({ content: "", citations, refused: false, ids });
  }

  const sources = assistantSources(results.map((r) => ({ label: where(r), text: bodyText(r.chunk.text) })));
  const messages: ChatMessage[] = [
    ...historyMessages(input.history),
    { role: "user", content: assistantUser(sources, question) },
  ];

  // One retry when the draft is empty or cites nothing valid without
  // saying it's off-syllabus: a model slip (free models sometimes return
  // an empty completion), not a judgement about the question. The client
  // is told to clear what it already showed.
  const system = subject.kind === "course" ? assistantSystem(subject.title) : spaceAssistantSystem(subject.withCourses);
  let checked = checkAnswer("", 0);
  for (let attempt = 1; attempt <= ANSWER_ATTEMPTS; attempt++) {
    let full = "";
    let released = false;
    const text = await withUsage(subject.kind === "course" ? "assistant" : "space-chat", user.id, () =>
      getEngine().complete(
        { system, messages, tier: "fast", temperature: 0.2, maxTokens: ANSWER_MAX_TOKENS, signal },
        (delta) => {
          full += delta;
          if (released) return input.onDelta?.(delta);
          if (releasable(full) > 0) {
            released = true;
            input.onDelta?.(full);
          }
        },
      ),
    );
    checked = checkAnswer(text, results.length);
    const slipped = checked.refused && !text.includes(NOT_IN_SYLLABUS);
    if (!slipped || attempt === ANSWER_ATTEMPTS) break;
    if (released) input.onReset?.();
  }
  if (checked.refused) return save({ content: "", citations: [], refused: true, ids });

  const cited = checked.cited.map((i) => results[i]);
  const placed = await place(
    cited,
    cited.map((_, n) => `${claimsFor(checked.content, n + 1)} ${question}`),
  );
  const citations = cited.map((r, n) => cite(r, placed[n].startSec, labels));
  return save({ content: checked.content, citations, refused: false, ids });
}

interface Labels {
  ordinals: Map<string, number>;
  titles: Map<string, string>;
  /* The private space's chips can come from several courses, so each
     course's is prefixed with its code: "MATH 201 · Lecture 3 · 12:48". */
  codes: Map<string, string> | null;
}

/* Document chunks (feature 18) are labelled with their document's title
   (joined into the search, feature 29), lecture chunks by their lesson's
   number in the course. */
async function labelsFor(subject: AssistantSubject, results: SearchResult[], user: Viewer): Promise<Labels> {
  const titles = new Map(results.flatMap((r) => (r.chunk.documentId && r.chunk.documentTitle !== null ? [[r.chunk.documentId, r.chunk.documentTitle] as const] : [])));
  if (subject.kind === "course") {
    return { ordinals: new Map(subject.lessonIds.map((id, i) => [id, i + 1])), titles, codes: null };
  }
  // Number each cited course's lessons the way its player does, as this user sees them.
  const courseIds = [...new Set(results.flatMap((r) => (r.chunk.courseId ? [r.chunk.courseId] : [])))];
  const courses = await Promise.all(courseIds.map((id) => getCourseForUser(id, user)));
  const ordinals = new Map<string, number>();
  const codes = new Map<string, string>();
  for (const found of courses) {
    if (!found) continue;
    codes.set(found.course.id, found.course.code);
    found.modules.flatMap((m) => m.lessons).forEach((l, i) => ordinals.set(l.id, i + 1));
  }
  return { ordinals, titles, codes };
}

function label(r: SearchResult, startSec: number | null, { ordinals, titles, codes }: Labels): string {
  const fallback = r.chunk.ownerId ? "Your upload" : "Course document";
  const doc = r.chunk.documentId ? { title: titles.get(r.chunk.documentId) ?? fallback, section: r.chunk.section } : null;
  const text = citationLabel(ordinals.get(r.chunk.lessonId ?? "") ?? null, startSec, r.chunk.page, doc);
  const code = r.chunk.courseId ? codes?.get(r.chunk.courseId) : undefined;
  return code ? `${code} · ${text}` : text;
}

function cite(r: SearchResult, startSec: number | null, labels: Labels): ChatCitation {
  return {
    chunkId: r.chunk.id,
    courseId: r.chunk.courseId,
    lessonId: r.chunk.lessonId,
    startSec,
    page: r.chunk.page,
    documentId: r.chunk.documentId,
    section: r.chunk.section,
    label: label(r, startSec, labels),
  };
}

/* For each chunk: the moment inside it that best matches its claim, and
   what was said there. Falls back to the chunk's start and its text. */
async function place(chunks: SearchResult[], claims: string[]): Promise<{ startSec: number | null; snippet: string }[]> {
  // Only video chunks are placed on the lesson's transcript; a recording
  // document's times are its own (feature 18).
  const onVideo = (r: SearchResult) => !r.chunk.documentId && r.chunk.lessonId && r.chunk.startSec !== null && r.chunk.endSec !== null;
  const timed = chunks.filter(onVideo);
  const segments = await segmentsInRanges(
    timed.map((r) => ({ lessonId: r.chunk.lessonId!, fromSec: r.chunk.startSec!, toSec: r.chunk.endSec! })),
  );
  return chunks.map((r, i) => {
    const fallback = { startSec: r.chunk.startSec, snippet: snippet(bodyText(r.chunk.text)) };
    if (!onVideo(r)) return fallback;
    const inside = segments.filter(
      (s) => s.lessonId === r.chunk.lessonId && s.startSec >= r.chunk.startSec! && s.startSec <= r.chunk.endSec!,
    );
    const best = bestMoment(inside, claims[i]);
    if (!best) return fallback;
    const at = inside.indexOf(best);
    const said = inside
      .slice(at, at + 2)
      .map((s) => s.text.trim())
      .join(" ");
    return { startSec: best.startSec, snippet: snippet(said) };
  });
}

/* Chunk text without its chapter-title prefix (see chunk-transcript.ts). */
function bodyText(text: string): string {
  const cut = text.indexOf("\n\n");
  return cut >= 0 ? text.slice(cut + 2) : text;
}

function snippet(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/* Recent turns for context. Old citations would point at another turn's
   sources, so markers are removed; refusals and moment lists are skipped. */
function historyMessages(history: ChatTurn[]): ChatMessage[] {
  return history
    .filter((t) => t.role === "user" || (!t.refused && t.content.trim() !== ""))
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.role === "assistant" ? stripMarkers(t.content) : t.content }));
}

/* ---- The routes' shared pieces ------------------------------------------------
   POST /api/assistant (feature 14) and POST /api/space/chat (feature 19). */

/* The course a question is about, if this person may see it, and their AI
   usage over the day, in one batch: one round trip before the question is
   reserved (feature 29). The usage is only acted on once the course is
   known to be visible (checkCountedBudget). */
export async function courseForQuestion(courseId: string, user: Viewer): Promise<{ course: CourseForUser | null; usage: AiUsageToday }> {
  const [access, mods, lessons, usage] = await db.batch([...courseForUserQueries(courseId, user), usageTodayQuery(user.id)]);
  return { course: toCourseForUser([access, mods, lessons]), usage: toUsageToday(usage) };
}

/* Per user, across both: they count the same chat_turns. */
export const QUESTION_LIMIT = { questions: 20, minutes: 5 };
export const QUESTION_LIMIT_MESSAGE = `That's ${QUESTION_LIMIT.questions} questions in ${QUESTION_LIMIT.minutes} minutes. Take a short break and ask again.`;

/* Both routes export maxDuration = 300, Vercel Hobby's ceiling, where the
   function is stopped and the stream cut with no message. The whole answer
   (retrieval, the model with its fallbacks and one retry, placing the
   chips) gets 240 s of it (feature 30). At the limit the stream ends with
   TOO_LONG, the model call is abandoned (the engine gets the signal), and
   no answer is saved afterwards. The question stays saved in its thread
   (reserveQuestion), so it's there to ask again. */
export const ANSWER_TIME_LIMIT_MS = 240_000;
export const TOO_LONG_MESSAGE = "That took too long. Try again.";

/* The answer as NDJSON, one event per line:
     {"type":"thread","threadId"}   first
     {"type":"delta","text"}        raw answer text as it arrives
     {"type":"reset"}               drop the text so far (a retry follows)
     {"type":"done","turn"}         the checked answer, which replaces the
                                    streamed text, with its citations
     {"type":"error","message"}     instead of done, if it failed or ran
                                    out of time
   A failure is logged like any server error (lib/utils/server-error.ts):
   by then the response has started, so onRequestError doesn't see it. */
export function answerStream(
  threadId: string,
  run: (on: { delta: (text: string) => void; reset: () => void; signal: AbortSignal }) => Promise<TurnView>,
  where: { route: string; userId: string | null; limitMs?: number },
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AssistantEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const deadline = new AbortController();
      const timer = setTimeout(
        () => deadline.abort(new DOMException(TOO_LONG_MESSAGE, "TimeoutError")),
        where.limitMs ?? ANSWER_TIME_LIMIT_MS,
      );
      const expired = new Promise<never>((_, reject) =>
        deadline.signal.addEventListener("abort", () => reject(deadline.signal.reason), { once: true }),
      );
      send({ type: "thread", threadId });
      try {
        const turn = await Promise.race([
          run({ delta: (text) => send({ type: "delta", text }), reset: () => send({ type: "reset" }), signal: deadline.signal }),
          expired,
        ]);
        send({ type: "done", turn });
      } catch (err) {
        const timedOut = deadline.signal.aborted;
        logServerError({ source: "stream", route: where.route, path: `thread ${threadId}`, userId: where.userId, error: err });
        send({ type: "error", message: timedOut ? TOO_LONG_MESSAGE : friendly(err) });
      } finally {
        clearTimeout(timer);
        open = false;
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
