import { queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { indexNoteChunks } from "@/lib/ai/retrieval/index-note";
import { jobHooks } from "./lib/job-progress";

/* Index a private note for its owner's chat (feature 19): cut its source
   into passages, embed, replace the note's old chunks. Run by
   ingest-document once the note's drafts are saved, with the owner as
   concurrency key. Re-running is safe (it rebuilds the same chunks) and
   cheap, so it may retry. A note deleted meanwhile is simply skipped. */

const noteIndex = queue({ name: "note-index", concurrencyLimit: 2 });

export const indexNoteTask = schemaTask({
  id: "index-note",
  schema: z.object({ noteId: z.uuid() }),
  queue: noteIndex,
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  ...jobHooks,
  run: async ({ noteId }) => indexNoteChunks(noteId),
});
