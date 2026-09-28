# Feature 14: Course assistant

**Status:** Done (2026-09-28)
**Depends on:** 13
**Demo step:** 6

## Goal

A student asks about a topic. They get an explanation from their course
material, with citation chips that **jump to the moment in the lecture**.
Off-syllabus questions are refused.

## Scope

**In:**
- The assistant in the lesson player (lesson or course scope) and at
  `/courses/[courseId]/assistant` (course scope).
- Streaming answers.
- Citations.
- Refusal.
- "Where was this taught?"
- Logging.

**Out:** private-space chat (19), which reuses this code.

## Schema

- `chat_threads`: id, userId, courseId, lessonId (nullable), title,
  createdAt.
- `chat_turns`: id, threadId, role, content, citations (jsonb:
  `[{chunkId, lessonId, startSec, page, label}]`), refused (bool),
  retrievedChunkIds (uuid[]), createdAt.

## Files

- `lib/ai/prompts`: `assistantSystem(courseTitle)`.
  - Explain **only** from the numbered sources.
  - Cite each claim inline as `[S3]`.
  - If the sources don't answer the question, output exactly
    `<<NOT_IN_SYLLABUS>>`.
  - Never use general knowledge.
  - Use KaTeX-friendly `$…$` maths.
- `lib/ai/assistant.ts`: `answer({ userId, scope, question, history })`.
  1. `searchChunks`.
  2. **Relevance gate:** if the top similarity is below
     `ASSISTANT_MIN_SIMILARITY` and there is no full-text hit, return the
     refusal without calling the LLM.
  3. Build the sources, labeled `[S1] Lecture 3 · 12:48 — …`.
  4. Stream from the `fast` tier.
  5. After the stream: if the output is `<<NOT_IN_SYLLABUS>>`, or has no
     valid `[S#]`, replace it with the refusal. Drop any `[S#]` that wasn't
     sent.
  6. Map the valid citations to chips.
  7. Log to `ai_usage` and `chat_turns`.
- `app/api/assistant/route.ts`: a streaming route handler.
  - zod body, then `requireEnrollment` or `requireCourseStaff`.
  - Streams the text, then a final citations event.
- `components/assistant/assistant-chat.tsx`:
  - Message list with rendered Markdown and maths.
  - Suggested prompts drawn from chapter titles.
- `components/assistant/citation-chip.tsx`: "Lecture 3 · 12:48". In the
  same lesson it calls `seek(768)`. Otherwise it links to
  `/courses/…/lessons/…?t=768`.
- `components/assistant/refusal.tsx`:
  - "That topic isn't part of *[Course]*. I can only help with material
    taught in this course."
  - An "Ask your instructor" button, which opens a discussion post with the
    question pre-filled (feature 21; until then it's a disabled button with
    a tooltip).
- "Where was this taught?" mode: skip generation and show the top three
  chunks as moment cards (lesson, time, snippet) that jump when clicked.

## Implementation notes

- The refusal copy is fixed text, not generated.
- Rate-limit to 20 questions per 5 minutes per user (a simple Postgres
  counter). Keep it light: this is a demo.
- The lesson player gets an "Ask" tab or side panel scoped to the lesson,
  with a "whole course" toggle.

## Acceptance criteria

- [x] "Explain [topic from the demo lecture]" returns an explanation with
      at least one chip. Clicking it seeks the player to within 15 seconds
      of where the topic is taught.
- [x] A chip for a different lesson opens that lesson at the right time.
- [x] All 5 off-syllabus test questions show the refusal. For those
      questions, the ones below the threshold make no LLM call (checked in
      `ai_usage`).
- [x] A made-up `[S9]` citation never renders.
- [x] An unenrolled user gets a 404 from the route.
- [x] `npm run build` passes.

## Implementation notes (as built)

- Pure checks live in `lib/chat/citations.ts` (shared with the chat UI),
  types in `lib/chat/types.ts`. `lib/ai/assistant.ts` runs the steps;
  `lib/db/chat.ts` stores threads and turns.
- The route does its access check with one `getCourseForUser` call
  instead of `requireEnrollment`: the same SQL rule, but it returns a JSON
  404 rather than throwing, and the same call gives the lesson order for
  "Lecture n" labels.
- **Chip times:** a chip seeks to the transcript line inside the cited
  chunk that shares the most words with the sentence citing it (and the
  question), not to the chunk's start. With too little overlap it keeps
  the chunk's start. On the test lecture chips land within ~1 s of the
  sentence.
- **Retry:** an empty draft, or one with no valid `[S#]` that isn't the
  refusal token, is retried once (a `reset` event clears the streamed
  text). Free models sometimes return an empty completion.
- **At most two citations per claim:** the prompt asks for it, and the
  server keeps the first two of any run of three or more markers.
- **"Where was this taught?"** turns are stored with empty `content` and
  one citation per moment, each with a `snippet`.
- Follow-up questions are searched together with the previous question.
- NDJSON events: `thread`, `delta`, `reset`, `done`, `error`.
