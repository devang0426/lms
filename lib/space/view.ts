import type { JobState } from "@/lib/jobs/stages";

/* A private note as the student's space shows it (feature 19). Pure:
   shared by the dashboard, the note page and their tests. */

export type NotePhase = "uploading" | "processing" | "ready" | "failed";

type SourceStatus = "uploading" | "processing" | "ready" | "failed";

/* Where a note stands, from its source document and the latest ingest run.
   The run keeps going after the document is read (notes, cards, quiz,
   indexing), so a ready document with a live run is still being made, and
   one whose run failed later needs a retry. */
export function notePhase(source: { status: SourceStatus } | null, job: JobState | null): NotePhase {
  if (!source) return "failed";
  const ended = job === "failed" || job === "canceled";
  switch (source.status) {
    case "uploading":
      return "uploading";
    case "failed":
      return "failed";
    case "processing":
      return ended ? "failed" : "processing";
    case "ready":
      if (job === "queued" || job === "running") return "processing";
      return ended ? "failed" : "ready";
    default: {
      const never: never = source.status;
      throw new Error(`Unknown document status ${String(never)}`);
    }
  }
}

/* "Week 2 Slides.pdf" → "Week 2 Slides": a note's first title, until the
   source is read (a web page or video then brings its own). */
export function noteTitleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled note";
}

/* "Ready · 27 cards · 24 questions" and the like, for a note's card. */
export function noteSummary(phase: NotePhase, counts: { cards: number; questions: number }): string {
  switch (phase) {
    case "uploading":
      return "The upload didn't finish";
    case "processing":
      return "Being made — this takes a few minutes";
    case "failed":
      return "Something went wrong";
    case "ready": {
      const parts = [
        counts.cards ? `${counts.cards} ${counts.cards === 1 ? "card" : "cards"}` : null,
        counts.questions ? `${counts.questions} ${counts.questions === 1 ? "question" : "questions"}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Notes ready";
    }
    default: {
      const never: never = phase;
      throw new Error(`Unknown note phase ${String(never)}`);
    }
  }
}
