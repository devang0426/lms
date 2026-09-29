import { queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { markPodcastFailed } from "@/lib/db/podcasts";
import { jobHooks, reportProgress, userFacingError } from "./lib/job-progress";
import { makePodcast } from "./lib/podcast";

/* Feature 17: a lesson podcast, made only when someone presses Generate
   (lib/podcast). The AI calls already retry a bad answer once and back
   off on rate limits, so a failed run isn't retried: that would only
   spend more. Its own queue, so podcasts never hold up lesson drafting. */

const podcastQueue = queue({ name: "podcast", concurrencyLimit: 2 });

export const generatePodcastPayload = z.object({ podcastId: z.uuid() });

export const generatePodcastTask = schemaTask({
  id: "generate-podcast",
  schema: generatePodcastPayload,
  queue: podcastQueue,
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
  ...jobHooks,
  onFailure: async ({ ctx, error, payload }) => {
    await jobHooks.onFailure({ ctx, error });
    await markPodcastFailed(payload.podcastId, userFacingError(error));
  },
  run: async ({ podcastId }, { ctx }) =>
    makePodcast(podcastId, (stage, progress, message) => reportProgress(ctx.run.id, { stage, progress, message })),
});
