import { queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { jobHooks, reportProgress } from "./lib/job-progress";
import { draftCards, draftChapters, draftNotes, draftQuiz, type StepOptions, type StepResult } from "./lib/lesson-content";
import { draftNoteCards, draftNoteNotes, draftNoteQuiz } from "./lib/note-content";

/* Pipeline steps 8–10 (feature 12): chapters → notes → flashcards → quiz.
   video-process runs all four after transcription (reporting to its own
   run, which the lesson editor watches); the review screen runs one on
   its own with `force` to regenerate that tab (reporting to its own run).
   Given a noteId instead of a lessonId, notes, cards and quiz are drafted
   for a student's private note (feature 19; ingest-document runs them with
   the owner as concurrency key). The AI calls already retry a bad answer
   once and back off on rate limits, so a failed task isn't retried again —
   that would only spend more. All four share one queue so a batch of
   uploads can't flood the provider. */

const lessonAi = queue({ name: "lesson-ai", concurrencyLimit: 3 });

const runOptions = {
  /* Set when run by video-process (or ingest-document): progress goes to that run. */
  parentRunId: z.string().min(1).optional(),
  /* Regenerate even if this video (or note) already has content of this kind. */
  force: z.boolean().optional(),
  /* Who pressed Regenerate: the AI calls are charged to them (feature 25).
     Left out, a lesson's drafts are charged to whoever uploaded its source. */
  requestedBy: z.uuid().optional(),
};

export const lessonContentPayload = z.union([
  z.object({ lessonId: z.uuid(), ...runOptions }),
  z.object({ noteId: z.uuid(), ...runOptions }),
]);

/* Each task's slice of the progress bar: [from, to] percent. When it runs
   inside video-process the slices line up after transcription; on its own
   it uses the whole bar. */
export const CONTENT_SLICES = {
  chapters: [62, 68],
  notes: [68, 86],
  cards: [86, 90],
  quiz: [90, 99],
} as const;

type Kind = keyof typeof CONTENT_SLICES;
type Step = (id: string, opts: StepOptions) => Promise<StepResult>;

/* `noteStep` drafts the same kind for a private note; chapters have none
   (a document has pages and sections, not times). */
function contentTask(kind: Kind, step: Step, noteStep?: Step) {
  return schemaTask({
    id: `generate-${kind}`,
    schema: lessonContentPayload,
    queue: lessonAi,
    retry: { maxAttempts: 1 },
    maxDuration: 1800,
    ...jobHooks,
    run: async (payload, { ctx }) => {
      const { parentRunId, force, requestedBy } = payload;
      const [from, to] = parentRunId ? CONTENT_SLICES[kind] : [0, 100];
      const report = (fraction: number, message: string) =>
        reportProgress(
          parentRunId ?? ctx.run.id,
          { stage: kind, progress: Math.round(from + (to - from) * fraction), message },
          { asChild: Boolean(parentRunId) },
        );
      const result =
        "noteId" in payload
          ? noteStep
            ? await noteStep(payload.noteId, { force, report })
            : { skipped: true, count: 0 }
          : await step(payload.lessonId, { force, report, requestedBy });
      if (!parentRunId) await report(1, result.skipped ? "Already drafted." : "Draft ready to review.");
      return result;
    },
  });
}

export const generateChaptersTask = contentTask("chapters", draftChapters);
export const generateNotesTask = contentTask("notes", draftNotes, draftNoteNotes);
export const generateCardsTask = contentTask("cards", draftCards, draftNoteCards);
export const generateQuizTask = contentTask("quiz", draftQuiz, draftNoteQuiz);
