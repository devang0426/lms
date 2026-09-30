import { logger, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { buildUserExport } from "@/lib/account/export";
import { EXPORT_FAILED_MESSAGE } from "@/lib/account/rules";
import { markExportFailed } from "@/lib/db/data-export";
import { jobHooks, reportProgress } from "./lib/job-progress";

/* Feature 33: "Download my data". Reads everything Studyhall keeps about
   one person (lib/db/data-export.ts), shapes it into one JSON file
   (lib/account/export-document.ts) and saves it to exports/{userId}/.
   No AI calls. Re-running is safe: a row that's no longer being built is
   skipped. The owner is the run's concurrency key, so one person's
   requests queue behind each other. */

const dataExport = queue({ name: "data-export", concurrencyLimit: 2 });

export const exportUserDataTask = schemaTask({
  id: "export-user-data",
  schema: z.object({ exportId: z.uuid() }),
  queue: dataExport,
  retry: { maxAttempts: 3 },
  maxDuration: 300,
  ...jobHooks,
  onFailure: async ({ ctx, error, payload }) => {
    await jobHooks.onFailure({ ctx, error });
    await markExportFailed(payload.exportId, EXPORT_FAILED_MESSAGE);
  },
  run: async ({ exportId }, { ctx }) => {
    const built = await buildUserExport(exportId, (stage, progress, message) => reportProgress(ctx.run.id, { stage, progress, message }));
    logger.info(built ? "Data export saved" : "Data export skipped", { exportId, bytes: built?.bytes ?? 0 });
    return { bytes: built?.bytes ?? 0 };
  },
});
