/* Shapes shared by the assistant's server code and the chat UI (feature 14).
   Types only: safe to import from client components. */

export interface ChatCitation {
  chunkId: string;
  lessonId: string | null;
  startSec: number | null;
  page: number | null;
  /* "Lecture 3 · 12:48" */
  label: string;
  /* "Where was this taught?" answers: what was said there. Such a turn has
     empty `content` and one citation per moment. */
  snippet?: string;
}

/* One message in a thread. In an assistant turn's `content`, [S1] refers
   to citations[0], [S2] to citations[1], and so on. A refused turn has no
   content; the UI shows the fixed refusal. */
export interface TurnView {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  refused: boolean;
}

/* The NDJSON events of POST /api/assistant, one per line. */
export type AssistantEvent =
  | { type: "thread"; threadId: string }
  | { type: "delta"; text: string }
  /* The first draft failed its check and is being retried: clear the text. */
  | { type: "reset" }
  | { type: "done"; turn: TurnView }
  | { type: "error"; message: string };

export type AssistantMode = "answer" | "where";
