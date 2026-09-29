import "server-only";

import { EngineError, OPENROUTER_DEFAULT_CHAINS } from "@/lib/ai/engine";
import { supportsTask, unsupportedMessage } from "@/lib/ai/engine/router";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

/* Embedding passages for the retrieval index: a lesson's (features 13 and
   18) or a private note's (19). One model for every vector: vectors from
   different models can't be compared. It's stored on each row. */

export const EMBEDDING_MODEL = OPENROUTER_DEFAULT_CHAINS.embeddings[0];
const EMBED_BATCH = 64;

export async function embedPassages(
  texts: string[],
  opts: {
    /* ai_usage feature, and who the cost is logged to. */
    feature: string;
    userId: string | null;
    /* Shown when the model answers with the wrong number or width of vectors. */
    failMessage: string;
    report?: (fraction: number, message: string) => Promise<void>;
  },
): Promise<number[][]> {
  const engine = getEngine();
  if (!supportsTask(engine, "embeddings")) throw new EngineError(unsupportedMessage("embeddings"), "unsupported");
  const embeddings: number[][] = [];
  await withUsage(opts.feature, opts.userId, async () => {
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      await opts.report?.(i / texts.length, `Indexing for the assistant: ${i} of ${texts.length} passages…`);
      embeddings.push(...(await engine.embed(texts.slice(i, i + EMBED_BATCH))));
    }
  });
  if (embeddings.length !== texts.length || embeddings.some((e) => e.length !== EMBEDDING_DIMENSIONS)) {
    throw new EngineError(opts.failMessage);
  }
  return embeddings;
}
