/* Stage lists shared by tasks (which report the current stage key) and the
   JobProgress UI (which draws the list). Pure: safe in client components
   and in Trigger.dev tasks. Each pipeline adds its own list here. */

export interface JobStage {
  key: string;
  label: string;
}

export const HELLO_STAGES = [
  { key: "warm-up", label: "Warming up" },
  { key: "count", label: "Counting to five" },
  { key: "ai", label: "Asking the AI" },
  { key: "wrap-up", label: "Wrapping up" },
] as const satisfies readonly JobStage[];

/* AI lesson content (feature 12): drafted after transcription, or one kind
   at a time when regenerated from the review screen. */
export const CONTENT_STAGES = [
  { key: "chapters", label: "Drafting chapters" },
  { key: "notes", label: "Writing notes" },
  { key: "cards", label: "Writing flashcards" },
  { key: "quiz", label: "Writing the quiz" },
] as const satisfies readonly JobStage[];

/* index-lesson (feature 13): runs when a lesson is published. */
export const INDEX_STAGES = [{ key: "index", label: "Indexing for the assistant" }] as const satisfies readonly JobStage[];

/* ingest-document (feature 18): read the document, then (reading lessons)
   draft from it, then index the lesson. The drafting subtasks report the
   same stage keys as they do under video-process. */
export const DOCUMENT_STAGES = [
  { key: "read", label: "Reading the document" },
  { key: "transcribe", label: "Transcribing (recordings only)" },
  CONTENT_STAGES[1],
  CONTENT_STAGES[2],
  CONTENT_STAGES[3],
  INDEX_STAGES[0],
] as const satisfies readonly JobStage[];

/* generate-podcast (feature 17): made only when someone asks for it. */
export const PODCAST_STAGES = [
  { key: "script", label: "Writing the conversation" },
  { key: "voices", label: "Recording the two voices" },
  { key: "mix", label: "Joining the audio" },
  { key: "save", label: "Saving the episode" },
] as const satisfies readonly JobStage[];

/* video-process (features 10 and 12). Subtasks report finer messages under these. */
export const VIDEO_STAGES = [
  { key: "probe", label: "Checking the file" },
  { key: "faststart", label: "Preparing it for streaming" },
  { key: "poster", label: "Making a poster image" },
  { key: "audio", label: "Extracting the audio" },
  { key: "transcribe", label: "Transcribing" },
  { key: "captions", label: "Writing captions" },
  ...CONTENT_STAGES,
] as const satisfies readonly JobStage[];

export const JOB_STAGES = {
  hello: HELLO_STAGES,
  "video-process": VIDEO_STAGES,
  "generate-chapters": [CONTENT_STAGES[0]],
  "generate-notes": [CONTENT_STAGES[1]],
  "generate-cards": [CONTENT_STAGES[2]],
  "generate-quiz": [CONTENT_STAGES[3]],
  "index-lesson": INDEX_STAGES,
  "generate-podcast": PODCAST_STAGES,
  "ingest-document": DOCUMENT_STAGES,
} as const satisfies Record<string, readonly JobStage[]>;

export type JobKind = keyof typeof JOB_STAGES;

export type JobState = "queued" | "running" | "completed" | "failed" | "canceled";
export const TERMINAL_JOB_STATES: readonly JobState[] = ["completed", "failed", "canceled"];

/* Trigger.dev run status → our jobs.status. Shared by the server's
   reconcile step and the live JobProgress view. */
export function jobStateFromRun(status: string): JobState {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "CANCELED":
    case "EXPIRED":
      return "canceled";
    case "FAILED":
    case "CRASHED":
    case "SYSTEM_FAILURE":
    case "TIMED_OUT":
      return "failed";
    case "EXECUTING":
    case "WAITING":
      return "running";
    default:
      return "queued";
  }
}

/* What a task writes to run metadata, and mirrors to the jobs row. */
export interface JobProgressMeta {
  stage: string;
  progress: number;
  message: string;
}
