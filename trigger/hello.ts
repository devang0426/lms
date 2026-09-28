import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import { HELLO_STAGES } from "@/lib/jobs/stages";
import { jobHooks, reportProgress } from "./lib/job-progress";

/* Smoke task (feature 09): walks through its stages with live progress
   and, when asked, makes one tiny AI call logged to ai_usage. */

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const [warmUp, count, ai, wrapUp] = HELLO_STAGES;

export const hello = schemaTask({
  id: "hello",
  schema: z.object({ userId: z.uuid(), withAi: z.boolean().default(false) }),
  retry: { maxAttempts: 1 },
  maxDuration: 120,
  ...jobHooks,
  run: async ({ userId, withAi }, { ctx }) => {
    const runId = ctx.run.id;

    await reportProgress(runId, { stage: warmUp.key, progress: 5, message: "Stretching…" });
    await pause(1500);

    for (let i = 1; i <= 5; i++) {
      await reportProgress(runId, { stage: count.key, progress: 5 + i * 12, message: `${i} of 5` });
      await pause(1000);
    }

    let reply: string | null = null;
    if (withAi) {
      await reportProgress(runId, { stage: ai.key, progress: 70, message: "Asking a fast model to say hello…" });
      reply = await withUsage("hello-smoke", userId, () =>
        getEngine().complete({
          system: "You are a terse assistant.",
          messages: [{ role: "user", content: "Reply with exactly: Hello from Studyhall" }],
          tier: "fast",
          maxTokens: 600, // fast-tier models may reason first
          temperature: 0,
        }),
      );
      logger.info("AI replied", { reply });
    }

    await reportProgress(runId, { stage: wrapUp.key, progress: 95, message: reply ? `AI said: ${reply.trim()}` : "Done counting." });
    await pause(800);
    return { reply };
  },
});
