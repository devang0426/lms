import { queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { jobHooks, reportProgress } from "./lib/job-progress";
import { draftCards, draftChapters, draftNotes, draftQuiz, type StepOptions, type StepResult } from "./lib/lesson-content";

/* Pipeline steps 8–10 (feature 12): chapters → notes → flashcards → quiz.
   video-process runs all four after transcription (reporting to its own
   run, which the lesson editor watches); the review screen runs one on
   its own with `force` to regenerate that tab (reporting to its own run).
   The AI calls already retry a bad answer once and back off on rate
   limits, so a failed task isn't retried again — that would only spend
   more. All four share one queue so a batch of uploads can't flood the
   provider. */

const lessonAi = queue({ name: "lesson-ai", concurrencyLimit: 3 });

export const lessonContentPayload = z.object({
  lessonId: z.uuid(),
  /* Set when run by video-process: progress goes to that run. */
  parentRunId: z.string().min(1).optional(),
  /* Regenerate even if this video already has content of this kind. */
  force: z.boolean().optional(),
});

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

function contentTask(kind: Kind, step: (lessonId: string, opts: StepOptions) => Promise<StepResult>) {
  return schemaTask({
    id: `generate-${kind}`,
    schema: lessonContentPayload,
    queue: lessonAi,
    retry: { maxAttempts: 1 },
    maxDuration: 1800,
    ...jobHooks,
    run: async ({ lessonId, parentRunId, force }, { ctx }) => {
      const [from, to] = parentRunId ? CONTENT_SLICES[kind] : [0, 100];
      const report = (fraction: number, message: string) =>
        reportProgress(
          parentRunId ?? ctx.run.id,
          { stage: kind, progress: Math.round(from + (to - from) * fraction), message },
          { asChild: Boolean(parentRunId) },
        );
      const result = await step(lessonId, { force, report });
      if (!parentRunId) await report(1, result.skipped ? "Already drafted." : "Draft ready to review.");
      return result;
    },
  });
}

export const generateChaptersTask = contentTask("chapters", draftChapters);
export const generateNotesTask = contentTask("notes", draftNotes);
export const generateCardsTask = contentTask("cards", draftCards);
export const generateQuizTask = contentTask("quiz", draftQuiz);
