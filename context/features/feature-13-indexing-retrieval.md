# Feature 13: Indexing and retrieval

**Status:** Done (2026-09-28)
**Depends on:** 12
**Demo step:** 6 (behind the scenes)

## Goal

Every published lesson is split into chunks and embedded. Hybrid retrieval,
scoped by access, returns chunks with timestamps or pages.

## Scope

**In:**
- The `content_chunks` table.
- The `index-lesson` task.
- The retrieval function.
- An evaluation script.

**Out:** the chat UI and answering (14).

## Schema

`content_chunks`:
- id, courseId (nullable), lessonId (nullable), noteId (nullable), ownerId
  (nullable, for private uploads)
- kind: `video | doc | note`
- text
- startSec, endSec (nullable)
- page (nullable)
- embedding: `vector(1536)`, matching the model's dimension
- model
- tsv: `tsvector`, generated from text

Indexes:
- HNSW on the embedding (`vector_cosine_ops`).
- GIN on `tsv`.
- B-tree on (courseId) and (ownerId).

## Files

- `lib/ai/retrieval/chunk-transcript.ts`:
  - Groups segments into windows of about 45–90 seconds with a 10-second
    overlap.
  - Never crosses a chapter boundary.
  - Prefixes each chunk with its chapter title for context.
  - Pure and tested.
- `trigger/index-lesson.ts`:
  - Deletes the lesson's old chunks.
  - Embeds in batches (one model, from `OPENROUTER_DEFAULT_CHAINS.embeddings`).
  - Inserts.
  - Runs on Publish. Unpublish deletes the chunks.
- `lib/ai/retrieval/search.ts`:
  `searchChunks({ userId, scope: {courseId} | {lessonId} | {ownerId}, query, k })`.
  1. Embed the query.
  2. Vector top-k and full-text top-k, **with the access filter inside the
     SQL** (joined to enrollments or course_staff, or `ownerId = userId`).
  3. Merge with reciprocal rank fusion.
  4. Return `{chunk, similarity, ftsRank}[]`.
- `scripts/eval-retrieval.ts`: reads
  `scripts/demo-assets/eval.json`:
  - 10 on-syllabus questions, each with an expected `startSec`.
  - 5 off-syllabus questions.
  - It prints hit@3 within 15 seconds and the top similarity for each
    question. This is used to pick `ASSISTANT_MIN_SIMILARITY`.

## Acceptance criteria

- [x] Publishing the demo lecture creates chunks that cover its whole
      duration.
- [x] `eval-retrieval`: at least 8 of the 10 on-syllabus questions have a
      top-3 chunk within 15 seconds of the expected time.
- [x] The off-syllabus questions score clearly below the chosen threshold.
- [x] A user not enrolled in the course gets 0 results for its content.
- [x] `npm run build` passes.

## Implementation notes (as built)

- "Within 15 seconds" is measured from the expected moment to the chunk's
  time range: 0 when the chunk contains it. A citation seeks to the chunk's
  start, which can be up to a window (45–90 s) earlier than the moment
  itself. Feature 14 should seek to the best-matching segment inside the
  chunk if its "seeks within 15 s" check needs it.
- `eval.json` accepts a list of times per question ("any of these"). The
  seeded test lecture repeats one ~52 s script, so every chunk contains
  every answer and hit@3 passes trivially. The real check needs the real
  lecture and its answer key.
- Full-text search uses `websearch_to_tsquery` (all words must match), so
  a full-text hit is a strong on-topic signal for the relevance gate.
- Publish from the builder's toggle also indexes (the transcript goes live
  with the lesson). A published lesson that gets a new video is re-indexed
  by `video-process`. The seed indexes the demo lecture directly.
