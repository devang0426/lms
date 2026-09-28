# Architecture Context

## Stack

The deployment is a **demo on the lowest possible cost**. Every service runs
on its free tier where one exists. AI is pay-as-you-go through OpenRouter's
cheapest models.

| Layer | Technology | Role | Cost for demo |
| ----- | ---------- | ---- | ------------- |
| Framework | Next.js 16 (App Router) + TypeScript + React 19 | Pages, server components, server actions, route handlers | — |
| Hosting | Vercel | Web app | Free (Hobby). See the note below |
| UI | Tailwind CSS v4 + own `components/ui/` | Tokens from `ui-context.md` | — |
| Auth | **Clerk** | Sign-in, sessions, user management, roles in `publicMetadata`; Google/Microsoft SSO later | Free tier |
| Database | **Neon** Postgres + **Drizzle ORM** (`neon-http` driver) | Relational data; one branch for dev, one for the demo. `DATABASE_URL` = direct (migrations), `DATABASE_URL_POOLED` = pooled (runtime). Use `db.batch` for atomic writes. `lib/db/client` connects on first use, so importing it never needs env vars | Free tier |
| Vector search | **pgvector** on Neon | Embeddings of transcript and document chunks | Included |
| Background jobs | **Trigger.dev v4** | Video prep, transcription, generation, embeddings, TTS | Free tier |
| Video | **Plain MP4 on Vercel Blob**, played by a native `<video>` element | Storage and CDN delivery with HTTP range requests (seeking works) | Hobby free allowance; video views count against data transfer |
| File storage | **Vercel Blob** (one store, path prefixes) | PDFs, DOCX, audio, posters, VTT, podcast MP3s, submissions | Same store |
| AI | `lib/engine` via OpenRouter (cheap default chains already set in `lib/engine/index.ts`) | Chat, JSON output, Whisper, TTS (Kokoro), embeddings | Pay-as-you-go, a few cents per lecture |
| YouTube | yt-dlp inside a Trigger.dev task | Best-effort import only | — |
| Tests | Vitest + Playwright | Unit tests, demo end-to-end | — |

**Why Vercel Blob:** it is the same platform as hosting, so there is no
second cloud account. Browser uploads go direct with `@vercel/blob/client`
(multipart for large videos). Trigger.dev tasks read and write it with
`BLOB_READ_WRITE_TOKEN`.

**Trade-off:** unlike R2, Blob bills data transfer. A 20-minute 720p
lecture is roughly 200–400 MB, so every full view uses that much of the
free allowance. That's fine for a demo. Keep demo videos at **720p and a
moderate bitrate**, and watch usage in the Vercel dashboard.

**Access (verify at implementation):** use **private** Blob access if the
store supports it. Otherwise public Blob URLs are unguessable but not
signed. The server only hands a URL to enrolled users, but anyone the URL
is shared with can open it. That is acceptable for the demo, but not for
real rollout.

**Left out to save cost:**

- No video transcoding service (such as Mux).
- No email provider: notifications are in-app only.
- No paid monitoring: the Trigger.dev dashboard and Vercel logs are enough
  for the demo.

**Vercel Hobby note:** the Hobby plan is for non-commercial use. If the demo
is part of a paid pitch, move to Pro. Nothing in the code changes.

## Cost rules

1. **No transcoding.** Instructors upload MP4 (H.264 video, AAC audio). The
   pipeline only remuxes, which is a copy with no re-encode, plus poster and
   audio extraction. All of these are cheap ffmpeg work. Any other codec is
   rejected with a clear message.
2. **Generate only on demand where possible.** A lesson pipeline makes the
   transcript, chapters, notes, flashcards, quiz and index. **Podcasts** and
   extra quiz sets are made only when someone presses the button.
3. **Use cheap model tiers.** Use the `fast` tier for free-text work:
   chunk notes and chat. Use `strong` for structured JSON (chapters,
   cards, quiz) and note merging: the fast chain was slow at structured
   output and one of its models could run away (feature 12). The switch
   costs about 1–2¢ more per lecture. Both chains start with OpenRouter
   `:free` models and fall back to cheap paid ones on rate limits or
   failures. Use one small embedding model.
4. **Cache and reuse.** Generated artifacts are stored and never rebuilt
   unless the source or `PROMPTS_VERSION` changes. Assistant answers are not
   cached (they are per student), but retrieval is cheap.
5. **Log AI usage** (`ai_usage`: feature, model, tokens, cost) so the real
   cost per lecture is known before a budget is set. Log only: no quotas or
   credits in v1.

## Where the NitroAI code stands

`lib/` was copied from NitroAI (a single-user Vite and Electron/Tauri app
that stores data in the browser). It does **not** compile here yet: 33
missing-module errors (`idb`, `uuid`, `katex`, `marked`, `dompurify`,
`pdfjs-dist`, `mammoth`, `vitest`, `@tauri-apps/api`).

| Module | Status | What has to change |
| ------ | ------ | ------------------ |
| `engine/` (openai, anthropic, router, resilient, types) → **now `lib/ai/engine/`** (feature 05 ✓) | **Keep** | Server-only. The university key comes from env. `transcribe()` already returns `segments[{start,end,text}]`, which the timestamp feature is built on. Drop the `publik` provider. `local.ts` is for dev only. |
| `engine/keys.ts`, `prefs.ts`, `publik*.ts`, `localSetup.ts`, `theme.ts`, `app.tsx` | **Drop** | Not needed: BYO key, keychain, publik metering, Ollama setup, dark theme, the browser app context. |
| `generation/index.ts`, `generation/chunk.ts` | **Keep** | Pure. Called from Trigger.dev tasks. Add `generateChapters()` and timestamp-aware notes. |
| `generation/pipeline.ts` | **Rewrite as Trigger.dev tasks** | Today it runs in the browser tab and dies when the tab closes. It also **throws away transcript segments** (`text = tr.text`). The new version keeps them. |
| `prompts/` | **Keep and extend** | Add prompts for chapters, cited answers, and the off-syllabus refusal. Bump `PROMPTS_VERSION`. |
| `ingest/text`, `ingest/docx` | **Keep** | Move to tasks. |
| `ingest/pdf` | **Adapt** | Uses a Vite-only `?url` worker import. Switch to a Node-friendly extractor and keep page numbers for citations. |
| `ingest/url` | **Rewrite server-side** | Add an SSRF guard and readability extraction. |
| `ingest/youtube` + `ytdlp.mjs` | **Move into a task** | Keep the VTT cue timestamps; `vttToText` drops them today. Best-effort only: YouTube often blocks cloud IPs. |
| `audio/chunk.ts` | **Replace** with ffmpeg | Uses WebAudio, which only exists in the browser. ffmpeg in a Trigger.dev task cuts the audio into pieces under the Whisper upload limit, then shifts each piece's segment times by its offset. |
| `study/fsrs.ts`, `study/mastery.ts` | **Keep** | Pure. FSRS state moves to a per-(student, card) table. Change `masteryColor` from red/amber/green to sage/butter/clay. |
| `markdown.ts`, `export.ts` | **Keep** | Always sanitize with DOMPurify. |
| `db/` | **Replace** with Drizzle on Neon | The `Repo` method names are a guide for the data-access layer. `memory.ts` can stay as a test fake. |
| `types.ts` | **Becomes the Drizzle schema** | Add owner/scope, `status` (draft/published) and timestamps to the content tables. |

## Video pipeline (plain MP4)

1. **Upload:**
   - A server action checks that the user is the course instructor.
   - It creates the `videos` row (`status=uploading`).
   - The browser calls `upload()` from `@vercel/blob/client` with
     `multipart: true` for `videos/{lessonId}/source.mp4`. The upload
     progress callback drives the progress bar.
   - The route `app/api/blob/upload` (`handleUpload`) checks the Clerk
     session and course-instructor role in `onBeforeGenerateToken`. It
     allows only `video/mp4` and caps the size.
   - The browser uploads directly to Blob.
   - Video bytes never pass through Next.js.
2. **Start:**
   - `onUploadCompleted` (or a client server action as a fallback, since
     the callback can't reach localhost) saves the blob URL and pathname.
   - It then triggers `video-process` with the idempotency key
     `lesson:{id}:process`.
3. **Probe:**
   - `ffprobe` checks the container, codecs (H.264/AAC), duration and size.
   - Files that fail get `status=rejected` and a clear message.
4. **Faststart:**
   - If the `moov` atom is at the end of the file, run
     `ffmpeg -c copy -movflags +faststart`. This is a copy with no
     re-encode.
   - It lets playback and seeking start before the full file downloads.
   - The result is `put()` back to the same pathname
     (`allowOverwrite`).
5. **Poster:** take a frame at about 10% into the video, saved as
   `poster.jpg`.
6. **Audio:** extract 16 kHz mono audio, then cut it into pieces under the
   Whisper upload limit.
7. **Transcribe:**
   - Run Whisper on each piece.
   - Shift each segment's times by its piece's offset.
   - Store the results in `transcript_segments` (lessonId, idx, startSec,
     endSec, text).
   - Write `captions.vtt` to Blob.
   - The video is now `ready`. Steps 8–10 run as their own tasks
     (`generate-chapters`, `-notes`, `-cards`, `-quiz`, one `lesson-ai`
     queue). If one fails, the video stays ready and the instructor
     regenerates that kind from the review screen.
8. **Chapters:**
   - The LLM reads the timestamped transcript and returns 6–15 chapters,
     each `{title, startSec, summary}`.
   - Each `startSec` is snapped to the nearest segment start. Chapters
     under 20 s apart are merged, and the answer is rejected (retried
     once) if any chapter covers more than 40% of the lecture.
9. **Notes:**
   - One section per chapter, four written at once. Each opens with a
     `##` heading that keeps its `startSec`, so it links to the video.
   - A strong-tier "merge" adds only an overview and key takeaways around
     the sections, which stay as written.
10. **Flashcards and quiz:**
    - Generated from the notes, labelled "Chapter n". The model returns
      the chapter number; the item stores that chapter's `startSec`, for
      "review in video".
    - 15+ cards; 8 questions at each of basic, intermediate and exam.
      Unanswerable questions are dropped; too few → retry once.
    - Every item keeps `videoId` and `promptsVersion`. A step skips a kind
      already drafted from the live video, so a replacement upload
      redrafts.
11. **Index:**
    - Group segments into windows of about 45–90 seconds, with a small
      overlap, that follow chapter boundaries.
    - Embed them into `content_chunks`.
12. **Draft ready:**
    - An in-app notification goes to the instructor.
    - Students still see nothing until the instructor publishes.

**Playback:**

- The lesson page checks enrollment on the server.
- Only then does it pass the Blob URLs for the MP4, the poster and the VTT
  to the player. With private access, these are short-lived signed
  downloads.
- A native `<video>` element with a `<track>` for captions handles range
  requests and seeking.
- The chapter list and the transcript panel control
  `videoEl.currentTime`.
- `?t=<seconds>` sets the start time on load.

Documents (PDF, DOCX, URL) run steps 9–12 the same way, with `page` or
`section` in place of timestamps.

## Course assistant (explain, cite, jump; refuse off-syllabus)

The **syllabus** of a course is its published lessons: transcripts, notes
and attached documents. If the instructor uploads a syllabus document, that
counts too.

1. **Ask:** in a lesson (scope = that lesson) or course-wide (scope = all
   published lessons in the course).
2. **Retrieve:**
   - Embed the question.
   - Search pgvector, filtered to the course and the student's enrollment,
     and take the top ~8 chunks.
   - Merge those with Postgres full-text matches, so exact terms and
     formulas are found too.
3. **Relevance gate (refuse before spending on generation):**
   - Refuse if the best chunk's similarity is below a set threshold (tune
     it with the test set) and full-text search found no match.
   - The refusal returns a fixed message with **no LLM call**: "That topic
     isn't part of *[Course]*. I can only help with material taught in this
     course."
   - The refusal offers a button to "Ask your instructor", which opens a
     discussion post.
4. **Answer:**
   - The LLM sees only the numbered chunks, each labeled with its lesson
     and `mm:ss` (or page).
   - It must explain only from those chunks and cite chunk IDs inline.
   - The system prompt forbids answering from general knowledge.
   - If the chunks don't actually answer the question, the model returns
     the refusal token and the server shows the same refusal message.
5. **Check citations:**
   - Map each chunk ID to `{lessonId, startSec}` or `{docId, page}`.
   - Drop any ID that was not in the retrieved set.
   - If no valid citation is left, show the refusal instead of the answer.
6. **UI:**
   - The answer streams in.
   - Citation chips read "Lecture 3 · 12:48".
   - In the same lesson, a chip seeks the player. Otherwise it navigates to
     `/courses/[courseId]/lessons/[lessonId]?t=768`.
7. **Log** the question, the retrieved chunk IDs, whether it was refused,
   the citations and the cost. This feeds tuning and "most-asked topics".

A student's **private space** chat follows the same rules. Its "syllabus" is
their own uploads.

## System Boundaries

- `app/(auth)/`: Clerk `<SignIn />` page and the demo account picker.
- `app/(student)/`: home, catalog, course detail, lesson player, assistant,
  study tools, calendar, grades, private space. Nested shell groups:
  `(sidebar)` for sidebar pages, `(topnav)` for course detail, `(focus)`
  for the lesson player. Each shell layout calls `requireAreaRole()`.
- `app/(instructor)/`: dashboard, course builder, upload and
  review/publish, grading, gradebook, announcements, analytics.
- `app/(admin)/`: terms, users and roles, courses and enrollments, audit log.
- `app/api/`: the Clerk webhook (user sync), the streaming assistant
  chat, and `progress` (the lesson player's pagehide beacon).
- `trigger/`: Trigger.dev tasks (`video-process`, `transcribe-lesson`,
  `generate-chapters`, `generate-notes`, `generate-cards`, `generate-quiz`,
  `index-lesson`, `ingest-document`, `generate-podcast`).
- `trigger.config.ts`: at the root; declares the ffmpeg build extension.
- `components/ui/`: design-system primitives.
- `components/shell/`: app shells, nav config (`nav-config.ts`), page
  header and placeholder, error view.
- `components/<feature>/`: video-player, transcript-panel, chapter-list,
  citation-chip, assistant-chat, flashcard-deck and similar.
- `lib/ai/`: engine, generation, prompts, ingest, retrieval, relevance
  gate. Server-only.
- `lib/study/`, `lib/markdown.ts`: pure shared logic.
- `lib/db/`: Drizzle schema, migrations, scoped data-access functions
  (`courses.ts` for course/lesson access, `enrollments.ts` for admin roster
  work, `audit.ts` for batched `audit_log` inserts, `progress.ts` for watch
  progress, completion and personal lesson notes).
- `lib/auth/`: Clerk helpers: `currentUser`, `requireRole`,
  `requireAreaRole` (layouts: redirect a mismatched role to its home),
  `homePathFor`, `requireEnrollment`, `requireCourseInstructor`.
- `lib/storage/`: Vercel Blob helpers (`blob.ts`: `putBlob`, `deleteBlobs`,
  `headBlob`, `recordUpload`), pathname and per-kind upload rules
  (`upload-kinds.ts`, pure) and upload authorization (`authorize.ts`,
  pure). The store is public; URLs get random suffixes.
- `lib/video/`: pure helpers (`vtt.ts`, `probe.ts`, `mp4-atoms.ts`,
  `watch.ts` for watched ranges, the 90% rule and resume position) and
  server modules `lessons.ts` (prepare the upload row, start processing,
  editor state, player playback) and `progress.ts` (the one save path for
  watch progress).
- `lib/time.ts`: `formatTime` / `parseT` for `mm:ss` display and `?t=`.
- `components/player/`: the lesson player. `PlayerProvider` owns the time
  and `seek(sec)`; `VideoPlayer`, `TranscriptPanel`, `ChapterList`,
  `NotesTab` and later citation chips use it.
- `trigger/`: `video-process` (parent) and its subtasks `video-probe`,
  `video-faststart`, `video-poster`, `transcribe-lesson`, then
  `generate-chapters`, `generate-notes`, `generate-cards`, `generate-quiz`
  (`generate-lesson-content.ts`; the steps themselves are in
  `trigger/lib/lesson-content.ts`), `index-lesson` (queue `lesson-index`;
  also re-run by `video-process` when a published lesson gets a new
  video); shared helpers in `trigger/lib/`.
- `lib/ai/generation/chapters.ts`, `lesson.ts`: lecture chapters, notes,
  cards and quiz from a timestamped transcript (engine passed in, no db).
  `retry.ts`: validate, retry once, then a `GenerationError` the
  instructor can read.
- `lib/db/lesson-content.ts`: the lesson's source transcript, replacing
  drafts, review edits (each scoped to the lesson in the query), the
  player's chapters and published notes, and the Publish statements.
- `app/(instructor)/…/lessons/[lessonId]/review/`: the review, edit,
  regenerate and publish screen; editors in `components/lesson-review/`.
- `lib/ai/retrieval/` (feature 13): `chunk-transcript.ts` (pure: 45–90 s
  windows, 10 s overlap, chapter-bounded, title-prefixed), `fusion.ts`
  (pure reciprocal rank fusion), `index-lesson.ts` (chunk, embed, replace;
  used by the `index-lesson` task and the seed) and `search.ts`
  (`searchChunks`: embed, vector + full-text top-k, fuse).
- `lib/ai/assistant.ts` (feature 14): `answer()` retrieves, gates,
  streams, checks citations and saves the turn. `lib/chat/` is pure and
  shared with the UI: `citations.ts` (answer checks, chip HTML, moment
  placement) and `types.ts`. `lib/db/chat.ts`: threads and turns (owner in
  every query), the rate-limit counter, transcript lines for placing
  chips. `app/api/assistant/route.ts` streams NDJSON.
  `components/assistant/`: the chat, answer body, citation chip, refusal.
- Flashcards (feature 15): `lib/db/study.ts` (due queue, counts,
  `recordReview` — visibility in SQL, FSRS applied on the server),
  `lib/study/cards.ts` (pure: the `StudyCard` type, interval previews,
  the session queue), `components/study/flashcard-deck.tsx`, `/study`, and
  the `rateCard` action next to it.
- Quizzes (feature 16): `lib/study/quiz.ts` (pure: answer checking with
  the fill-in-the-blank normalizer, and the shapes the browser may see),
  `lib/db/quizzes.ts` (practice, graded attempts with the limit and due
  date in SQL, mastery through `lib/study/mastery.ts`, the question bank),
  the player's Quiz tab (`components/study/quiz-tab.tsx`,
  `quiz-runner.tsx`, `mastery-bars.tsx`) with its actions in
  `…/lessons/[lessonId]/quiz-actions.ts`, and the instructor's create page
  under `…/lessons/[lessonId]/graded-quizzes/new`.
- `lib/db/chunks.ts`: `content_chunks` writes (`replaceLessonChunks`,
  `deleteLessonChunks`) and the search queries, with the access filter
  inside the SQL (admin, course staff, or active enrollment with course,
  module and lesson published; or the chunk's owner).
- `lib/jobs/`: `startJob`, `getJobForViewer` (reconciles with the run),
  `getJobAccessToken`; `stages.ts` holds stage lists shared with tasks.
- `lib/ai/usage.ts`: `withUsage(feature, userId, fn)`; the engine's
  `onUsage` hook feeds it.
- `app/api/blob/upload/`: the `handleUpload` route for client uploads.
- `proxy.ts`: `clerkMiddleware()`, which redirects signed-out users away
  from app routes. It is not authorization.

## Storage Model

**Neon Postgres** holds:

- People and courses:
  - `users`, mirrored from Clerk: clerkId, name, email, role.
  - `terms`, `courses`, `sections`, `course_staff`, `enrollments`.
  - `modules`, `lessons` (`status` draft/published).
- Video lessons:
  - `videos`: lessonId, blobUrl, pathname, posterUrl, vttUrl,
    durationSec, width, height, codec, sizeBytes, faststart, status
    (uploading/processing/ready/rejected/failed), error. One row per
    upload; a ready replacement deletes the older rows and blobs.
  - `transcript_segments` (lessonId, videoId, idx, startSec, endSec,
    text), `chapters` (lessonId, position, title, startSec, summary; no
    status of their own: they follow the lesson).
- Study material (feature 12; every generated row has `videoId` and
  `promptsVersion`, and a `status` that Publish sets):
  - `notes`: one per lesson (`lessonId` unique), or private with
    `ownerId` (feature 19); block JSON; a heading may carry `startSec`.
  - `flashcards` (front, back, topic, startSec), and `card_reviews`
    holding FSRS state per (student, card): due, stability (days),
    difficulty, reps, lapses, lastReview, state. No row = new, due now.
  - `quiz_questions` (type, difficulty, bank practice/graded, options,
    correctIndex, explanation, startSec). A question in a graded quiz is
    in the `graded` bank and never served to practice.
  - `graded_quizzes` (lessonId, title, questionIds, dueAt, maxAttempts,
    points), `quiz_attempts` (userId, lessonId, mode, gradedQuizId,
    startedAt, submittedAt, score 0–1) and `quiz_answers` (attemptId,
    questionId, answer, correct). Answers are scored on the server only.
  - Students see an item only when it is published and the lesson is
    visible to them.
- Coursework: `assignments`, `submissions`, `grades`.
- Student activity:
  - `watch_progress`: (userId, lessonId) key, positionSec,
    watchedRanges (jsonb, merged `[start, end]` pairs), completedAt
    (90% watched or "Mark complete"; never cleared).
  - `lesson_notes`: userId, lessonId, atSec, text.
- Communication: `announcements`, `discussions`, `notifications`.
- Assistant: `chat_threads` (user, course, lesson or null for
  course-wide, title) and `chat_turns` (role, content with `[S#]` markers,
  citations jsonb — `[S1]` is `citations[0]` — `refused`,
  `retrieved_chunk_ids`). Personal; `demo:reset` clears them.
- Jobs: `jobs` (Trigger.dev run ID, stage, status).
- Logging: `ai_usage` and `audit_log`.

**pgvector** holds `content_chunks`: text, embedding (`vector(1536)`,
HNSW cosine), model, a generated `tsv` (GIN), courseId, lessonId/noteId,
ownerId (for private uploads), kind (`video`/`doc`/`note`), and either
`startSec`/`endSec` or `page`. Publish (review screen or the builder's
lesson toggle) queues `index-lesson`; Unpublish deletes the lesson's
chunks in the same batch. Course or module status needs no clean-up: the
search's access filter checks them.

**Vercel Blob** holds the files:

- `videos/{lessonId}/source.mp4 | poster.jpg | captions.vtt`
- `docs/…`, `podcasts/…`, `submissions/…`, `private/{userId}/…`

The database stores only the key, size, MIME type and checksum.

## Auth and Access Model

- **Clerk** handles sign-in. Email/password is used for the demo. Google or
  Microsoft SSO can be switched on later in the Clerk dashboard with no
  code change.
- **Roles:**
  - The role (`admin`, `instructor`, `student`) is stored in Clerk
    `publicMetadata.role` and included in the session token. This allows
    cheap checks in `proxy.ts` and layouts.
  - A Clerk webhook (`user.created` / `user.updated`) mirrors each user into
    Neon `users`.
- **Course access** lives in Neon only: `course_staff` for instructors and
  `enrollments` for students.
- **Demo accounts:**
  - A seed script creates the Clerk users (via the Backend API) and their
    Neon rows.
  - When `DEMO_MODE=true`, the sign-in page lists the demo accounts.
  - Picking one signs in with a Clerk **sign-in token**, so no password is
    typed.
- **Catalog fields** (title, summary, outcomes, instructor, lesson count,
  length) of a published course in the current term are visible to every
  signed-in user (`lib/db/catalog.ts`). Nothing below that level is.
- Students read only **published** lessons of courses they are enrolled in.
  "Published" means the course, the lesson's module and the lesson are all
  published, and the enrollment is `active` (dropped enrollments are kept
  for audit). Admins count as staff on every course.
  Presigned video, poster and caption URLs are issued only after that check,
  and they expire.
- Only a course's instructors and admins can upload, edit, publish or grade.
- A student's private uploads, notes, cards, chats and attempts are visible
  only to them.
- Authorization happens in the data layer on every query. Clerk's
  `proxy.ts` and hiding things in the UI are conveniences, not security.

## Invariants

1. **AI, Blob token, Clerk secret and Trigger.dev keys are server-only.** `lib/ai`,
   `lib/db`, `lib/auth` and `lib/storage` are `server-only`.
2. **Request handlers never do long work.** Anything slow is a Trigger.dev
   task. The UI follows it with Trigger.dev Realtime.
3. **File bytes never pass through Next.js functions.** Uploads go straight
   to Vercel Blob as client uploads.
4. **Access checks happen in the query.** This covers content, Blob URLs
   handed to the client, and vector search.
5. **Students see only published course content.**
6. **The assistant stays within the syllabus.** It refuses off-syllabus
   questions, answers only from retrieved chunks, and the server drops any
   citation that wasn't retrieved.
7. **Timestamps are kept end to end.** No step may flatten a timestamped
   transcript without keeping the segment table.
8. **No transcoding.** Only MP4 H.264/AAC is accepted. ffmpeg only remuxes
   and extracts.
9. **Every AI call is logged in `ai_usage`.** This is logging only; quotas
   and credits are out of scope.
10. **All rendered Markdown and HTML is sanitized.** User-supplied URLs go
    through the SSRF guard.
11. **Styling uses `ui-context.md` tokens only.**
