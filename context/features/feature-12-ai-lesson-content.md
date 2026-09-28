# Feature 12: AI lesson content and review

**Status:** Done (browser checks, the Trigger.dev task run and the real
lecture's answer key pending; see progress-tracker.md)
**Depends on:** 10, 11
**Demo step:** 2, 3

## Goal

After transcription, the pipeline drafts timestamped **chapters, notes,
flashcards and a quiz**. The instructor reviews, edits and publishes them.

## Scope

**In:**
- Pipeline steps 8–10 as tasks.
- New prompts.
- The review/edit/publish screen.
- A pre-processed demo lecture in the seed.

**Out:**
- The student study experience (15 and 16).
- Indexing (13).

## Schema

- `chapters`: id, lessonId, position, title, startSec, summary.
- `notes`: id, lessonId (nullable), ownerId (nullable, for feature 19),
  title, blocks (jsonb; a heading block may carry `startSec`), status,
  promptsVersion, updatedAt.
- `flashcards`: id, lessonId/noteId, front, back, topic, startSec
  (nullable), status.
- `quiz_questions`: id, lessonId/noteId, type, difficulty, topic,
  question, options (text[]), correctIndex, explanation, startSec
  (nullable), status, bank (`practice | graded`).

## Files

- `lib/ai/prompts/`:
  - `chaptersSystem` and `chaptersSchema`. Input is the transcript with
    `[mm:ss]` markers. The output is 6–15 chapters.
  - Change `noteSectionSystem` to take one chapter's text, and to return
    Markdown whose `##` headings are that chapter's title.
  - Bump `PROMPTS_VERSION`.
- `lib/ai/generation/chapters.ts`: `generateChapters(engine, segments)`.
  It snaps each `startSec` to the nearest segment start and validates with
  zod.
- `trigger/generate-lesson-content.ts`:
  - `generate-chapters`
  - `generate-notes`: one section per chapter, tagging headings with
    `startSec`
  - `generate-cards`
  - `generate-quiz`: 8 questions at each of basic, intermediate and exam
  - `video-process` calls it after `transcribe-lesson`.
- `app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/`:
  - Tabs: Chapters, Notes, Flashcards, Quiz.
  - Edit inline: chapter title and time, note blocks (a simple block editor
    reusing `markdownToBlocks`/`blocksToMarkdown`), card front and back,
    question fields.
  - Regenerate per tab.
  - A **Publish** button that sets the lesson and all its generated items
    to `published`.
- Seed: `seedLecture()`.
  - Upload the demo MP4 from `scripts/demo-assets/` and run the full
    pipeline, or load a saved fixture of segments, chapters, notes, cards
    and quiz, so the demo database is ready without a wait.

## Implementation notes

- **From feature 05:** the fast chain starts with a reasoning model. Give
  every `complete()` call enough `maxTokens` for reasoning plus the answer.
  `generateTitle`'s 30 is too low, so use about 300. Alternatively, pass
  OpenRouter's reasoning-exclude option.

- Notes render with `lib/markdown.ts`, KaTeX included. A heading that has
  `startSec` shows a small "▶ 12:48" chip that seeks the player (or links
  with `?t=`).
- Flashcards and quiz items with `startSec` get a "Review in video" link
  (used in 15 and 16).
- Use the `fast` tier for chapters, notes sections and cards. Use `strong`
  for the quiz and the note merge only.
- The whole lecture stays a draft until Publish. Students see nothing
  before that.

## Acceptance criteria

- [ ] After an upload, the review screen shows chapters that start within
      about 15 seconds of real topic changes (checked against the demo
      lecture's answer key), plus notes, 15+ cards and 24 quiz questions.
- [ ] Edits persist. Publish makes everything visible to the demo student.
- [ ] Note headings seek the video in the lesson player.
- [x] `npm run db:seed` gives a published, fully processed demo lecture.
- [x] `npm run build` passes.
