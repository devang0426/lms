import { queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { indexLessonChunks } from "@/lib/ai/retrieval/index-lesson";
import { jobHooks, reportProgress } from "./lib/job-progress";

/* Index a lesson for the assistant (feature 13): chunk the transcript,
   embed, replace the old chunks. Started by Publish (review screen or the
   builder's toggle) and by video-process when a published lesson gets a
   new video. Re-running is safe — it rebuilds the same chunks — and cheap
   (a lecture is a fraction of a cent to embed), so it may retry. An
   unpublished lesson just has its chunks removed. */

const lessonIndex = queue({ name: "lesson-index", concurrencyLimit: 5 });

export const indexLesson = schemaTask({
  id: "index-lesson",
  schema: z.object({ lessonId: z.uuid() }),
  queue: lessonIndex,
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  ...jobHooks,
  run: async ({ lessonId }, { ctx }) => {
    const report = (fraction: number, message: string) =>
      reportProgress(ctx.run.id, { stage: "index", progress: Math.round(fraction * 95), message });
    await report(0, "Cutting the transcript into passages…");
    const result = await indexLessonChunks(lessonId, { report });
    const message = {
      indexed: `The assistant can now answer from ${result.chunks} passages.`,
      not_published: "The lesson isn't published, so it was left out of the assistant.",
      no_transcript: "This lesson has no transcript yet, so there was nothing to index.",
    }[result.status];
    await report(1, message);
    return result;
  },
});
