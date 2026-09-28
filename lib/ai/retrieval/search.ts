import "server-only";

import { z } from "zod";
import { EngineError } from "@/lib/ai/engine";
import { supportsTask, unsupportedMessage } from "@/lib/ai/engine/router";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import { searchChunkCandidates, type ChunkHit, type ChunkScope } from "@/lib/db/chunks";
import { reciprocalRankFusion } from "./fusion";

/* Hybrid retrieval (feature 13), used by the course assistant (14) and
   the private-space chat (19).

   1. Embed the query (one small model; the call is logged to ai_usage).
   2. Vector top-k and full-text top-k, each with the access filter inside
      the SQL (lib/db/chunks.ts): a user sees only chunks of courses they
      teach or are actively enrolled in (published lessons only), or their
      own private chunks.
   3. Merge the two rankings with reciprocal rank fusion.

   Each result keeps both scores. The assistant's relevance gate reads the
   best `similarity` and whether any `ftsRank` is set. */

export type { ChunkScope } from "@/lib/db/chunks";
export type RetrievedChunk = Omit<ChunkHit, "similarity" | "ftsRank">;
export interface SearchResult {
  chunk: RetrievedChunk;
  similarity: number;
  ftsRank: number | null;
}

export const DEFAULT_K = 8;
const MAX_QUERY_CHARS = 2000;

const input = z.object({
  userId: z.uuid(),
  scope: z.union([
    z.object({ courseId: z.uuid() }).strict(),
    z.object({ lessonId: z.uuid() }).strict(),
    z.object({ ownerId: z.uuid() }).strict(),
  ]),
  query: z.string().trim().max(MAX_QUERY_CHARS),
  k: z.number().int().min(1).max(50).default(DEFAULT_K),
});

export async function searchChunks(args: {
  userId: string;
  scope: ChunkScope;
  query: string;
  k?: number;
}): Promise<SearchResult[]> {
  const { userId, scope, query, k } = input.parse(args);
  if (query === "") return [];

  const engine = getEngine();
  if (!supportsTask(engine, "embeddings")) throw new EngineError(unsupportedMessage("embeddings"), "unsupported");
  const [embedding] = await withUsage("retrieval", userId, () => engine.embed([query]));
  if (!embedding?.length) throw new EngineError("The search model returned no embedding. Try again.", "unknown");

  const lists = await searchChunkCandidates({ userId, scope, query, embedding, k });
  return reciprocalRankFusion([lists.vector, lists.text])
    .slice(0, k)
    .map(({ item: { similarity, ftsRank, ...chunk } }) => ({ chunk, similarity, ftsRank }));
}
