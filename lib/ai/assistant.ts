import "server-only";

import type { ChatMessage } from "@/lib/ai/engine";
import { getEngine } from "@/lib/ai/engine/server";
import { assistantSystem, assistantUser } from "@/lib/ai/prompts";
import { searchChunks, type SearchResult } from "@/lib/ai/retrieval/search";
import { withUsage } from "@/lib/ai/usage";
import { addAssistantTurn, segmentsInRanges } from "@/lib/db/chat";
import type { Viewer } from "@/lib/db/courses";
import type { AssistantMode, ChatCitation, TurnView } from "@/lib/chat/types";
import type { ChatTurn } from "@/lib/db/schema";
import { bestMoment, checkAnswer, citationLabel, claimsFor, NOT_IN_SYLLABUS, releasable, stripMarkers } from "@/lib/chat/citations";

/* The course assistant (feature 14): explain, cite, jump — or refuse.

   1. Retrieve the course's chunks the user may see (searchChunks).
   2. Relevance gate: best similarity under ASSISTANT_MIN_SIMILARITY and no
      full-text hit → refuse with NO model call.
   3. Number the chunks as sources: "[S1] Lecture 3 · 12:48 — …".
   4. Stream the answer from the fast tier (ai_usage feature "assistant").
   5. Refuse on the refusal token or when no valid [S#] is left; drop the
      rest of the invalid ones (lib/chat/citations.ts). An empty or
      uncited draft that isn't the token is retried once first.
   6. Map each citation to a chip, placed on the transcript line inside
      the chunk that best matches the claim.
   7. Save the assistant turn (the route saved the question).

   "Where was this taught?" mode skips 4–5 and returns the top three
   chunks as moments. The refusal wording is fixed UI text, not generated. */


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

export async function answer(input: {
  user: Viewer;
  /* `lessonIds`: the course's lessons in order, as this user sees them
     ("Lecture n" in chip labels, the same numbering as the player's). */
  course: { id: string; title: string; lessonIds: string[] };
  scope: { courseId: string } | { lessonId: string };
  threadId: string;
  question: string;
  history: ChatTurn[];
  mode: AssistantMode;
  onDelta?: (text: string) => void;
  /* The streamed draft is being thrown away and retried. */
  onReset?: () => void;
}): Promise<TurnView> {
  const { user, course, threadId, question, mode } = input;
  const save = async (fields: { content: string; citations: ChatCitation[]; refused: boolean; ids: string[] }) =>
    toTurnView(
      await addAssistantTurn({
        threadId,
        content: fields.content,
        citations: fields.citations,
        refused: fields.refused,
        retrievedChunkIds: fields.ids,
      }),
    );

  // A follow-up ("and in 3D?") is searched together with the question before it.
  const previous = mode === "answer" ? [...input.history].reverse().find((t) => t.role === "user")?.content : undefined;
  const query = previous ? `${previous}\n${question}` : question;
  const results = await searchChunks({ userId: user.id, scope: input.scope, query, k: K });
  const ids = results.map((r) => r.chunk.id);

  if (!passesGate(results)) return save({ content: "", citations: [], refused: true, ids });

  const ordinals = new Map(course.lessonIds.map((id, i) => [id, i + 1]));
  const where = (r: SearchResult) => citationLabel(ordinals.get(r.chunk.lessonId ?? "") ?? null, r.chunk.startSec, r.chunk.page);

  if (mode === "where") {
    const top = results.slice(0, MOMENTS);
    const placed = await place(top, top.map(() => question));
    const citations = top.map((r, i) => ({ ...cite(r, placed[i].startSec, ordinals), snippet: placed[i].snippet }));
    return save({ content: "", citations, refused: false, ids });
  }

  const sources = results
    .map((r, i) => `[S${i + 1}] ${where(r)} — ${bodyText(r.chunk.text)}`)
    .join("\n\n");
  const messages: ChatMessage[] = [
    ...historyMessages(input.history),
    { role: "user", content: assistantUser(sources, question) },
  ];

  // One retry when the draft is empty or cites nothing valid without
  // saying it's off-syllabus: a model slip (free models sometimes return
  // an empty completion), not a judgement about the question. The client
  // is told to clear what it already showed.
  let checked = checkAnswer("", 0);
  for (let attempt = 1; attempt <= ANSWER_ATTEMPTS; attempt++) {
    let full = "";
    let released = false;
    const text = await withUsage("assistant", user.id, () =>
      getEngine().complete(
        { system: assistantSystem(course.title), messages, tier: "fast", temperature: 0.2, maxTokens: ANSWER_MAX_TOKENS },
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
  const citations = cited.map((r, n) => cite(r, placed[n].startSec, ordinals));
  return save({ content: checked.content, citations, refused: false, ids });
}

function cite(r: SearchResult, startSec: number | null, ordinals: Map<string, number>): ChatCitation {
  return {
    chunkId: r.chunk.id,
    lessonId: r.chunk.lessonId,
    startSec,
    page: r.chunk.page,
    label: citationLabel(ordinals.get(r.chunk.lessonId ?? "") ?? null, startSec, r.chunk.page),
  };
}

/* For each chunk: the moment inside it that best matches its claim, and
   what was said there. Falls back to the chunk's start and its text. */
async function place(chunks: SearchResult[], claims: string[]): Promise<{ startSec: number | null; snippet: string }[]> {
  const timed = chunks.filter((r) => r.chunk.lessonId && r.chunk.startSec !== null && r.chunk.endSec !== null);
  const segments = await segmentsInRanges(
    timed.map((r) => ({ lessonId: r.chunk.lessonId!, fromSec: r.chunk.startSec!, toSec: r.chunk.endSec! })),
  );
  return chunks.map((r, i) => {
    const fallback = { startSec: r.chunk.startSec, snippet: snippet(bodyText(r.chunk.text)) };
    if (r.chunk.startSec === null || r.chunk.endSec === null) return fallback;
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
