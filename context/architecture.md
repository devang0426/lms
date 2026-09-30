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
   cost per lecture is known. On top of the log there is one ceiling, a
   **daily safety limit per person** (feature 25, `lib/ai/budget.ts`):
   AI calls and cost over the last 24 hours, per role (students 150 calls
   and $0.25, staff 1,000 and $3 by default). Calls count as well as cost,
   because the `:free` models log $0 but share one quota for the whole key
   (20 a minute, 1,000 a day). It's checked before an assistant or
   space-chat question, a new private note or its retry, a podcast and a
   regenerate. There are no credits or top-ups.

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
    - An in-app notification (`draft_ready`) goes to the instructor who
      uploaded the video, while they still teach the course. It links to
      the review screen (`notifyDraftsReady`, `lib/db/notifications.ts`,
      feature 30). It's keyed on the video, so a re-run doesn't repeat
      it, and a notice that can't be written doesn't fail the run.
    - Students still see nothing until the instructor publishes.

**When processing stops (feature 26):**

- A video never stays `processing` once its run is gone:
  - If the run can't be queued, `startVideoProcessing` marks the video
    failed ("Processing couldn't start. Try again.") and tells the
    uploader.
  - `video-process`'s `onFailure` and `onCancel` hooks fail a video that
    is still processing.
  - Crashes and out-of-memory skip the hooks. For those, the lesson
    editor checks the latest run on every load
    (`lib/video/recovery.ts`, applied in `getLessonVideoState`).
  - Each path also puts a `processing` lesson back to ready or draft
    (`lib/db/videos.ts`).
- Every run expires after 30 minutes in the queue (`startJob`'s `ttl`), so
  a run no worker picks up is reconciled the same way. `JobProgress` shows
  a "worker may be offline" hint after 3 minutes.
- The editor offers Retry whenever the newest video failed. The uploader
  shows unless a run is working on it, so a stuck upload can always be
  replaced.

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

**Documents (feature 18):**

- A PDF, DOCX, web page, recording or YouTube link on a lesson goes
  through `ingest-document`:
  - Extract text into citable parts: pages, heading sections, or timed
    segments.
  - On a reading lesson with no video, draft notes, cards and quiz from
    all its documents (document mode: no chapters, no `startSec`).
  - Index the lesson.
- Web pages are fetched only through the SSRF guard
  (`lib/net/safe-fetch.ts`).
- Recordings and YouTube videos over `DOCUMENT_MAX_MINUTES` (default 90)
  are refused before anything is transcribed (feature 25): a recording by
  ffprobe, a YouTube video by yt-dlp's metadata before it downloads. The
  Whisper step also refuses audio that cuts into more pieces than that
  length allows, for when ffprobe can't tell.
- On other lessons documents are resources: indexed and cited, not
  drafted from.

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

A student's **private space** chat (feature 19) follows the same rules. Its
"syllabus" is their own uploads (scope `{ownerId}`): all of them, not only
the note the chat is opened from. With "Include my courses" on (per
question), it also searches the courses they're enrolled in or teach
(scope `{ownerId, withCourses}`), still through the search's access filter,
so a student gets only published lessons. The uploads and the courses are
searched separately and the rankings fused (RRF): searched as one pool, a
course's many lecture passages crowded a student's few pages out of the
top 8 in testing. Upload chips read "My slides ·
p. 7" and open the file; course chips read "MATH 201 · Lecture 3 · 12:48"
and open the lesson at `?t=`. The refusal is fixed copy without "Ask your
instructor". The cost is logged as `space-chat`.

## System Boundaries

- `app/(auth)/`: Clerk `<SignIn />` page and the demo account picker.
- `app/(public)/` (feature 34): the public pages, open to signed-out
  visitors. `/welcome` is the landing page, with its share image
  (`welcome/opengraph-image.tsx`); `/privacy` and `/terms` go with it.
  They're static: no session, no request APIs. The landing page is built
  at `next build` and regenerated at most hourly (`revalidate = 3600`) for
  its course list (`listPublicCatalog`, `lib/db/catalog.ts`). So a
  request never reaches the database. The institute's details come from
  `lib/institute.ts` (env, read at build). `app/robots.ts` and
  `app/sitemap.ts` list only these pages. Components are in
  `components/landing/`. The demo picker's data (`demoPickerProps`,
  `components/auth/demo-picker-props.ts`) is shared by sign-in and the
  landing page's "Try the demo".
- `app/(student)/`: home, catalog, course detail, lesson player, assistant,
  study tools, calendar, grades, private space. Nested shell groups:
  `(sidebar)` for sidebar pages, `(topnav)` for course detail, `(focus)`
  for the lesson player. Each shell layout calls `requireAreaRole()`.
- `app/(instructor)/`: dashboard, course builder, upload and
  review/publish, grading, gradebook, announcements, analytics.
- `app/(admin)/`: terms, users and roles, courses and enrollments, roster
  import, audit log.
- `app/api/`: the Clerk webhook (user sync), the streaming assistant
  chat, the private space's chat (`space/chat`), `progress` (the
  lesson player's pagehide beacon) and `notifications` (the bell's feed,
  with its mark-read actions next to it).
- `trigger/`: Trigger.dev tasks (`video-process`, `transcribe-lesson`,
  `generate-chapters`, `generate-notes`, `generate-cards`, `generate-quiz`,
  `index-lesson`, `ingest-document`, `generate-podcast`, `index-note`,
  and `export-user-data` and `erase-user` from feature 33), and the daily
  scheduled `notify-due-soon` (feature 21) and `prune-old-rows`
  (feature 30).
- `trigger.config.ts`: at the root; declares the ffmpeg build extension
  and the `node-22` runtime (feature 26).
- `components/ui/`: design-system primitives.
- `components/shell/`: app shells, nav config (`nav-config.ts`), page
  header and placeholder, error view (`ErrorView` with its way home, and
  `ErrorHeader` for shells whose navigation isn't in a layout).
- `components/<feature>/`: video-player, transcript-panel, chapter-list,
  citation-chip, assistant-chat, flashcard-deck and similar.
- `lib/ai/`: engine, generation, prompts, ingest, retrieval, relevance
  gate. Server-only.
- `lib/study/`, `lib/markdown-blocks.ts` (the block model, pure), `lib/markdown.ts` (HTML rendering and sanitizing; it loads jsdom): shared logic.
- `lib/db/`: Drizzle schema, migrations, scoped data-access functions
  (`courses.ts` for course/lesson access, `enrollments.ts` for admin roster
  work, `audit.ts` for batched `audit_log` inserts, `progress.ts` for watch
  progress, completion and personal lesson notes).
- `lib/auth/`: Clerk helpers: `currentUser`, `requireRole`,
  `requireAreaRole` (layouts: redirect a mismatched role to its home),
  `homePathFor`, `requireEnrollment`, `requireCourseInstructor`.
  `sync.ts` holds `syncUserFromClerk` (the Clerk → Neon upsert, which
  also applies pending invitations; re-exported from `lib/auth`).
  `clerk.ts` is the plain `@clerk/backend` client: no Next.js imports, so
  scripts and tasks can use it too.
- `lib/storage/`: Vercel Blob helpers (`blob.ts`: `putBlob`, `deleteBlobs`,
  `headBlob`, `recordUpload`), pathname and per-kind upload rules
  (`upload-kinds.ts`, pure) and upload authorization (`authorize.ts`,
  pure). The store is public; URLs get random suffixes.
- `lib/video/`: pure helpers (`vtt.ts`, `probe.ts`, `mp4-atoms.ts`,
  `watch.ts` for watched ranges, the 90% rule and resume position,
  `recovery.ts` for when a video is stuck and what the editor offers) and
  server modules `lessons.ts` (prepare the upload row, start processing,
  editor state with the stuck-video check, player playback) and
  `progress.ts` (the one save path for watch progress).
- `lib/db/videos.ts` (feature 26): `failProcessingVideo` and
  `restoreLessonStatus`, shared by the web app and `video-process`.
- `lib/db/lesson-cleanup.ts` (feature 26): `lessonLeftovers` collects the
  Blob files and unfinished jobs of a lesson, a module or (feature 35) a
  whole course before the builder deletes it.
- Course deletion (feature 35):
  - `lib/courses/delete.ts` (pure): the rule (`courseDeleteRefusal`), the
    dialog's list of what goes, and the typed-code check.
  - `lib/db/course-delete.ts`: `courseDeleteFacts`, and
    `deleteUnusedCourse`, one statement that re-checks the rule, deletes
    the course and the notifications linking into it, and writes the
    audit row.
  - The actions `courseDeleteCheck` and `deleteCourse` are in the
    builder's `actions.ts`; the dialog is
    `components/course-builder/delete-course.tsx`, on the Details tab.
- Data export and account deletion (feature 33):
  - `lib/account/rules.ts` (pure): the 7-day expiry, the daily limit of 3
    exports, the typed-email check, `deleteRefusal`, the Profile card's
    phase (`exportPhase`), and what the Delete dialog lists.
  - `lib/account/export-document.ts` (pure): shapes one person's rows
    into the JSON file. Files are linked through the access-checked
    routes, never by Blob URL.
  - `lib/db/data-export.ts`: the export rows (the request is limited and
    written in one locked batch), and `userExportQueries`, fifteen
    owner-scoped reads in one batch.
  - `lib/account/export.ts`: `requestExport`, the Profile card's state, and
    `buildUserExport` (the task body).
  - `lib/db/user-erase.ts`: `markUserDeleted` (one statement that also
    writes the audit row), `eraseLeftovers`, and `eraseUserRows`, one
    batch that deletes the private data and anonymises the row.
  - `lib/account/erase.ts`: `deleteAccount` (mark, then start the task),
    `startErase` (key `user:{id}:erase`), and `eraseUser` (cancel runs,
    rows, then files; the person's Blob folders are listed so stray files
    go too).
  - `lib/account/cleanup.ts`: the daily clean-up's two steps, for expired
    exports and unfinished erases.
  - Tasks: `export-user-data` (queue `data-export`, the owner as its
    concurrency key) and `erase-user` (queue `account-erase`).
  - Routes and UI:
    - The Profile page's "Your data" card (`components/account/`) and
      its `actions.ts`.
    - `app/exports/[exportId]` (owner-only redirect to the file).
    - The admin Users page's Delete button (`deleteUser` in
      `admin/users/actions.ts`, `DeleteUserButton`).
    - The Clerk webhook's `user.deleted`.
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
- `lib/courses/` (feature 27): `publish.ts` is **the one Publish**
  (`publishLessonWithContent`). The builder's row and the review screen
  both call it, so a lesson goes live with its drafted notes, flashcards
  and quiz, and a video lesson only with a ready video. `lessons.ts` and
  `setup.ts` are pure: the builder rules (addable types, refusals, what
  goes live) and the "Get your course live" steps.
  `lib/db/course-builder.ts` has the per-lesson facts (ready video, empty,
  drafts) and the checklist's per-course facts.
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
- Podcast (feature 17): `lib/ai/generation/podcast.ts` (the source
  text and its hash, the validated script, TTS per line with two Kokoro
  voices), `lib/study/podcast.ts` (pure: who may start one, when an
  episode is stale), `lib/db/podcasts.ts` (the stored episode, the atomic
  claim, the task's reads and writes), `lib/podcast/` (the tab's data and
  starting a run), the `generate-podcast` task (queue `podcast`; body in
  `trigger/lib/podcast.ts`, ffmpeg join in `trigger/lib/podcast-audio.ts`),
  and the player's Podcast tab (`components/study/podcast-tab.tsx`, action
  in `…/lessons/[lessonId]/podcast-actions.ts`).
- Documents (feature 18):
  - `lib/net/` is the SSRF guard: `address.ts` (pure public-IP check) and
    `safe-fetch.ts` (checks each address at connect time, follows
    redirects by hand, caps size and time, HTML only).
  - `lib/ai/ingest/`: `sections.ts` (HTML → heading sections), `url.ts`
    (guard + Readability), `docx.ts`, `pdf.ts` (per page), and
    `youtube/` (yt-dlp, friendly failure messages).
  - `lib/ai/retrieval/chunk-document.ts` (pure).
  - `lib/ai/generation/document.ts` (document mode).
  - `lib/db/documents.ts` (rows, and the viewer check).
  - `lib/documents/`: `index.ts` starts runs and gives the editor its
    state; `view.ts` (pure) has the labels and the access-checked links.
  - `trigger/ingest-document.ts`, with its body in
    `trigger/lib/ingest-document.ts` and the shared Whisper helper in
    `trigger/lib/transcribe.ts`.
  - `app/documents/[documentId]/route.ts`.
  - Components: `components/documents/` (the editor's `DocumentManager`,
    and the player's `ResourceList`).
- Private space (feature 19):
  - Routes: `/space` (the notes and the "New note" dialog) and
    `/space/[noteId]` (Notes, Flashcards, Quiz, Chat and Podcast tabs), in
    the `(sidebar)` shell, each with its `actions.ts`; the chat's stream is
    `app/api/space/chat`.
  - `lib/db/space.ts`: the owner's notes (every query filtered on
    `ownerId`, no staff override), create and delete, and the ingest
    task's reads and writes. `lib/space/`: `index.ts` (server: dashboard
    cards, the note page's run state, retry, delete with run cancel and
    Blob clean-up) and `view.ts` (pure: the note's phase, labels).
  - Tasks: `ingest-document` takes the private path when the document has
    an owner; `generate-notes`, `-cards` and `-quiz` accept `{ noteId }`
    (steps in `trigger/lib/note-content.ts`); `index-note` (queue
    `note-index`, body `lib/ai/retrieval/index-note.ts`). Every run of a
    student's upload or podcast carries the owner as its Trigger.dev
    `concurrencyKey`.
  - The lesson player's study components take a target instead of a
    lesson: `QuizTab` (`{courseId, lessonId}` or `{noteId}`), `PodcastTab`
    (`{lessonId}` or `{noteId}`), `FlashcardDeck` (course fields may be
    null). `components/space/`: the dialog, note card, export menu, delete
    button and `SpaceChat`.
- Coursework (feature 20):
  - `lib/coursework/`: pure `rules.ts` (due soon, the hand-in window and
    lock, score parsing, what a student sees), `gradebook.ts` (weights,
    totals, the table, CSV rows) and `csv.ts` (Excel-safe CSV); and
    `index.ts` (server: `handIn` checks each file ref against Blob).
  - `lib/db/assignments.ts` (the assignment, the student's own work, the
    one-statement hand-in, who may open a submission, the delete guard)
    and `lib/db/grades.ts` (the queue and grade view with the staff check
    in SQL, grade statements, gradebook reads, a student's own grades).
  - Routes: the player's assignment panel (`…/lessons/[lessonId]`,
    action `assignment-actions.ts`), the lesson editor's Assignment card
    (its own `assignment-actions.ts`), `/instructor/grading` and
    `/instructor/grading/[submissionId]`,
    `/instructor/courses/[id]/gradebook` (+ `/export`, the CSV), `/grades`
    (student), and `app/submissions/[submissionId]/files/[index]` (the
    access-checked file redirect).
  - Components in `components/coursework/`.
- Communication (feature 21):
  - Pure modules:
    - `lib/calendar/`: month grid, day grouping in the reader's zone,
      the date tile's tone and safe event links.
    - `lib/notifications/view.ts`: the feed shape, titles, "5 min ago".
    - `lib/discussions/view.ts`: limits, where a thread opens per role,
      and the draft "Ask your instructor" starts from.
  - Data layer. Access is in the SQL of each read:
    - `lib/db/events.ts`: the calendar reads, and the event statements
      that the assignment and graded-quiz saves batch.
    - `lib/db/announcements.ts`: the post plus its fan-out of
      notifications.
    - `lib/db/discussions.ts`: threads, replies, the answer mark, the
      reply notification and "Unanswered questions".
    - `lib/db/notifications.ts`: the feed, mark read, and the due-soon
      statement.
  - `renderPostMarkdown` in `lib/markdown.ts` renders what people write
    for each other with no raw HTML.
  - Student routes: `/calendar`, `/discussions`, `/discussions/[id]`
    (actions in `discussions/actions.ts`, shared by every discussion UI),
    the course page's Announcements tab and the player's Discussion tab.
  - Staff routes: the Post announcement dialog and "Unanswered questions"
    on `/instructor` (`announcement-actions.ts`); `/instructor/messages`
    and `/instructor/messages/[id]`; the course builder's Calendar tab
    (`courses/[courseId]/event-actions.ts`).
  - Components in `components/calendar/`, `components/discussions/`,
    `components/announcements/` and `components/notifications/` (the
    bell, placed by `SidebarShell` and `TopNavShell`).
- Dashboards and admin (feature 22):
  - Pure modules:
    - `lib/dashboard/stats.ts`: completion per course and overall, and
      "oldest waiting".
    - `lib/analytics/`: the heat-strip, the drop-off point, topics by
      chapter, the refusal rate.
    - `lib/roster/`: the CSV parser and per-row checks.
  - Data layer:
    - `lib/db/dashboard.ts`: the per-course numbers and 7-day activity,
      with the staff check in SQL.
    - `lib/db/analytics.ts`: anonymous watch ranges, question facts,
      chapters, AI cost.
    - `lib/db/users.ts`, `terms.ts`, `invitations.ts`.
    - Audit reads in `lib/db/audit.ts`.
  - Server modules:
    - `lib/roster/import.ts`: plan and apply, against the database and
      Clerk.
    - `lib/admin/clerk.ts`: find accounts by email, send and revoke
      invitations, set a role.
    - `lib/admin/links.ts`: the invitation's sign-up URL.
  - Routes: `/instructor` (the dashboard), `/instructor/analytics`, and
    `/admin/users`, `/admin/roster` and `/admin/terms` (each with its
    `actions.ts`), plus `/admin/audit`.
  - Components: `components/admin/` (role select, invite dialog, roster
    import, term controls) and `components/analytics/heat-strip.tsx`.
- Learners and progress (feature 31):
  - Pure modules in `lib/progress/`:
    - `learners.ts`: the Learners table rows, a course's average
      completion (`learnerCompletion` in `lib/dashboard/stats.ts`, the
      dashboard's rule) and the CSV.
    - `report.ts`: per-lesson state, mastery per topic across a course
      (through `lib/study/mastery.ts`) and a student's grades so far.
    - `next-up.ts`: the student's one "Next up".
  - Data layer: `lib/db/learners.ts`. It reads only existing tables
    (enrollments, watch_progress, quiz_attempts and answers,
    submissions and grades, card_reviews, lessons), never chats or the
    private space. It has one batch per page:
    - `loadLearners` and `courseLearners`: the staff check is in a
      course-id subquery;
    - `loadStudentReport`: every statement checks staff and the
      student's active enrollment;
    - `loadProgress`: the viewer's own rows only.
  - Routes:
    - `/instructor/learners`.
    - The course builder's Students tab (a second batch in Suspense).
    - `/instructor/courses/[id]/students/[studentId]` (the report) and
      `…/students/export` (the CSV).
    - `/progress` (student).
  - Components: `components/learners/`, `components/progress/`, and
    `components/coursework/gradebook-cell.tsx` (shared with the
    gradebook).
- `lib/db/chunks.ts`: `content_chunks` writes (`replaceLessonChunks`,
  `deleteLessonChunks`, and `replaceNoteChunks` for a private note) and
  the search queries, with the access filter inside the SQL (admin, course
  staff, or active enrollment with course, module and lesson published; or
  the chunk's owner).
- `lib/ai/retrieval/embed.ts`: the one embedding model and the batched
  embed loop shared by lesson and note indexing.
- `lib/jobs/`: `startJob` (optional `concurrencyKey`; a `ttl`, 30 minutes
  by default, after which a run no worker picked up expires), `getJobForViewer`
  (reconciles with the run; a private note's jobs are its owner's only),
  `latestJobsFor` (one query for a list), `cancelJob`,
  `getJobAccessToken`; `stages.ts` holds stage lists shared with tasks.
- `lib/ai/usage.ts`: `withUsage(feature, userId, fn)`; the engine's
  `onUsage` hook feeds it. Tasks charge whoever started the work: the
  uploader, the note's owner, the person who asked for a podcast, and
  (`requestedBy` in the payload) whoever pressed Regenerate or Publish.
- `app/api/blob/upload/`: the `handleUpload` route for client uploads.
- `proxy.ts`: `clerkMiddleware()`, which redirects signed-out users away
  from app routes. It is not authorization.
  - Since feature 34, a signed-out visitor on `/` goes to `/welcome`, and
    a signed-in one on `/welcome` goes to `/` (which sends staff on to
    `/instructor`).
  - The public routes are sign-in, sign-up, the webhooks, the Blob
    callback and the public pages.
  - The public pages don't go through Clerk where they needn't, because on
    Clerk's development instance (the demo deployment) a cookieless
    request is first sent round Clerk's "dev browser" handshake. That's two
    trips to Clerk on a first visit, and an endless loop for a crawler or
    a link preview:
    - `/privacy` and `/terms` skip Clerk entirely;
    - `/welcome` skips it when the request carries no session cookie;
    - the matcher leaves out `.txt` and `.xml` paths (`robots.txt`, the
      sitemap) and `/welcome/opengraph-image`.
    - `/` always asks Clerk, so no signed-in user is kept from home.
  - Any other signed-out request goes to `/sign-in?redirect_url=…`, and
    returns there afterwards. The demo picker follows the same rule
    through `safeReturnPath` (`lib/utils/return-path.ts`, same origin
    only).
- Hardening (feature 23):
  - `next.config.ts` sends the security headers. The CSP is an allowlist:
    Clerk's Frontend API host (from the publishable key), reads from this
    app's own Blob store (`BLOB_PUBLIC_HOST`, feature 24) and browser
    uploads, and Trigger.dev Realtime.
  - `app/api/blob/upload` checks the hourly upload limit
    (`uploadRateCheck`, counted by `recentUploadCount`) before issuing a
    token.
  - `e2e/`: Playwright (demo steps, axe and keyboard, 390px, LCP).
  - `npm run check:secrets` (`scripts/check-client-secrets.mjs`): the
    client-bundle scan, run locally after a build. There's no CI; Vercel
    builds each push to `main` (removed 2026-09-30, owner's call).
  - `context/demo-runbook.md`: how to set up, rehearse and run the demo.
- Security lockdown (feature 24; the whole model is in
  `security-architecture.md`):
  - `lib/env.ts`: the zod check over every environment variable, run by
    `instrumentation.ts → register()` when a server starts (not by
    `next build`). A bad config exits with one message naming every
    problem.
  - Demo mode: `DEMO_PASSCODE` (required on production), checked by
    `startDemoSession` in constant time. Role changes, invitations and
    roster Import are refused while `DEMO_MODE=true`. `app/dev/layout.tsx`
    answers 404 outside `next dev`. `lib/demo/reset-guard.ts` holds
    `demo:reset` to the `DEMO_DB_HOSTS` allowlist.
  - Graded quizzes: `lib/study/quiz.ts` holds the submit deadline (due
    date + 10 minutes) and the reveal. `reviewGradedAttempt`
    (`lib/db/quizzes.ts`) returns the best attempt with answers once
    revealed.
  - Uploads: `authorizeUpload` gives a private-note token only while the
    note waits for its file. `recordUpload` deletes any other file for
    it, and writes one audit row per file path.
  - `renderAnswerMarkdown` (`lib/markdown.ts`) renders assistant answers
    with raw HTML as text. Every renderer keeps `style` only on KaTeX
    output.
  - `assistantSources()` (`lib/ai/prompts`) wraps retrieved sources in
    `<source>` tags.
  - The CSP allows only this app's Blob store (`BLOB_PUBLIC_HOST`).
  - Invitation links come from `NEXT_PUBLIC_APP_URL`.
- AI spend guardrails (feature 25):
  - `lib/ai/budget.ts`: `usageToday` (calls and cost over 24 hours, on
    the `ai_usage (user_id, created_at)` index), `checkBudget` (ok, or the
    refusal "You've reached today's AI limit. It resets at HH:MM." plus an
    `ai.limit_reached` audit row with ids only), and the pure rules
    (`aiLimitsFor`, `limitClearsAt`). Limits come from
    `AI_DAILY_CALLS_STUDENT`, `AI_DAILY_USD_STUDENT`, `AI_DAILY_CALLS_STAFF`
    and `AI_DAILY_USD_STAFF`.
  - The reset time is in the reader's zone: the root layout's
    `TimeZoneCookie` sets a `tz` cookie, read by `readerTimeZone()`
    (`lib/utils/reader-zone.ts`). Without it the time says "UTC".
  - `lib/db/limits.ts`: limits that can't be raced. One `db.batch` takes
    `pg_advisory_xact_lock(hashtext('ai:'|'post:' || user))`, then
    `enforce_limit(count < max)` (a SQL function, migration 0018) aborts
    the batch when over, then writes. Used by `reserveQuestion`
    (`lib/db/chat.ts`: the thread is created only inside it),
    `createPrivateNote` (`lib/db/space.ts`) and the discussion actions.
  - `canRetryNote` (`lib/space/view.ts`): "Try again" only after a failure.
  - `lib/documents/length.ts`: `DOCUMENT_MAX_MINUTES` and its message.
  - `/admin/users`: an "AI today" column and an "At AI limit" filter.
- Performance (feature 29). Each Neon query is its own HTTPS round trip
  (~310 ms from India to us-east-2, ~1 s after the free database sleeps),
  so the round trips before a page renders are what's counted:
  - **One batch per page.** After the user lookup (and, where one is
    needed, the lesson gate `getLessonForUser`), a page reads through one
    `db.batch`. The page loaders live in `lib/db/`:
    - `course-page.ts` (`loadCourseDetail`, cached per request as
      `courseDetailFor`)
    - `player.ts` (`loadLessonPlayer`)
    - `builder-page.ts` (`loadCourseBuilder`)
    - `lesson-editor.ts` (`loadLessonEditor`)
    - `lesson-review.ts` (`loadLessonReview`)
    - `dashboardData` in `dashboard.ts`
    - `learners.ts` (`loadLearners`, `courseLearners`,
      `loadStudentReport`, `loadProgress`; feature 31)
    - `loadStudentHome` / `loadStudentCourses` in
      `components/student/load-courses.ts`
  - They compose `*Query` / `*Queries` builders that the domain modules
    export next to their old functions. Those functions still work, and
    `to*` shapers turn the rows into views.
  - A read that used to wait for another (transcript lines after the
    video, chat turns after the thread, work after the assignment,
    progress after the enrollment list, the dashboard after its course
    ids) goes through a subquery instead.
  - Statements batched with the access check carry their own guard
    (`canSeeCourse`, `isStaffOf`, `inCatalogCourse` in
    `lib/db/courses.ts` and `catalog.ts`), so invariant 4 holds.
    `getCourseForUser` is one batch (it was two round trips).
    `requireCourseStaff` is no longer called where `getCourseForUser` or
    `getLessonForUser` already decides staff access (the course builder,
    the lesson editor, the review page).
  - Measured round trips, with a production build and `DB_LOG=1`: the
    progress tracker's feature 29 entry has the table.
  - **Streaming.** `loading.tsx` in each section. The shell stays, a
    skeleton shows at once, and `PendingBar` (root layout) answers every
    link click. The lesson player's closed tabs (Transcript, Flashcards,
    Quiz, Podcast, Discussion: `loadPlayerPanels`) and the dashboard's
    grading list are awaited inside `<Suspense>`. Their reads go out
    after the page's batch, not beside it: a second request at the same
    moment opens a new connection (~1.1 s more from India).
  - **Client code.** The player's Ask, Quiz and Podcast tab bodies load
    with `next/dynamic` from a client wrapper
    (`components/player/lazy-tabs.tsx`), because Next splits code only
    for dynamic imports made in client components. Flashcards arrive as
    HTML rendered on the server (`renderCards`), so the player's first
    load needs no marked, KaTeX or DOMPurify.
  - **Fewer Trigger.dev calls.** `reconcileJob` asks `runs.retrieve` only
    about a job row untouched for 3 minutes (`RECONCILE_AFTER_MS`).
    Realtime already shows fresh progress.
  - **The assistant** counts the day's AI usage beside `getCourseForUser`
    (`checkCountedBudget`). `ai_usage` inserts start without being
    awaited inside `backgroundUsageWrites().run()`, and `after()` keeps
    the function alive until they land. The chunk search joins document
    titles in. The question itself is still saved inside the locked batch
    before any AI work: the limit can't be raced otherwise (feature 25).
  - **Caching.** `dueCountsByCourse` is wrapped in React `cache()` (the
    `/study` layout notice and page share it). `getCurrentUser` stays a
    per-request React `cache()`. Nothing user-scoped uses
    `unstable_cache` or `'use cache: private'`.
  - `DB_LOG=1` (`lib/db/query-log.ts`, through Neon's `fetchFunction`)
    logs each Neon request with its round-trip number, per render.
- Error handling and resilience (feature 30):
  - **Server actions** are each wrapped in `safeAction`
    (`lib/utils/safe-action.ts`). A throw, such as Neon's "fetch failed",
    becomes `fail("internal", "Something went wrong. Try again. (ref
    ab12cd)")`, so the page and what was typed stay. Next's
    `redirect()`/`notFound()` pass through. Client callers wrap their
    call in `settle()` (`lib/utils/action-result.ts`), so a request that
    never arrives also shows in place.
  - **One place for server errors:** `logServerError`
    (`lib/utils/server-error.ts`) writes one JSON line with the route,
    path, digest or ref, the Clerk user id and the error with its cause.
    It's fed by `instrumentation.ts` → `onRequestError` (pages, route
    handlers, the proxy), by `safeAction`, and by `answerStream` for a
    stream that had started. Vercel's logs show it; Sentry goes there
    later.
  - **Error pages:** `app/global-error.tsx` (its own document, fonts
    from `app/fonts.ts`), `app/error.tsx`, and one per shell: `(sidebar)`,
    `instructor/`, `admin/`, `(focus)` (draws `ErrorHeader`, back to the
    course), `(topnav)/courses/[courseId]` inside the top-nav shell, with
    `(topnav)/error.tsx` for when that shell's layout fails, and `(auth)`
    (draws `AuthShell`). Each shows "Try again" plus a way home, and the
    digest as its Ref.
  - **Time limits on streams:** `app/api/assistant` and `app/api/space/chat`
    export `maxDuration = 300`. `answerStream` gives the answer 240 s
    (`ANSWER_TIME_LIMIT_MS`), then ends it with "That took too long. Try
    again." and aborts the engine's signal. The engine's
    `withFallback` and `resilient()`'s backoff stop once a caller's
    signal fires. The question stays saved (`reserveQuestion`), and no
    answer is saved after the limit.
  - **Retention:** `trigger/prune-old-rows.ts`, daily at 21:30 UTC.
    Rules in `lib/retention/rules.ts`, SQL in `lib/db/retention.ts`.

## Storage Model

**Neon Postgres** holds:

- People and courses:
  - `users`, mirrored from Clerk: clerkId, name, email, role, deletedAt,
    erasedAt.
    - A deleted account is erased by the `erase-user` task (feature 33):
      its private data goes, and the row is anonymised ("Deleted user",
      no email or picture) and kept, with its id and clerkId.
    - Since migration 0020, every foreign key to `users` has a delete
      rule. `set null` keeps records that must outlive the person (the
      audit and AI usage actor, `createdBy` columns). `cascade` goes with
      them (course staff, enrollments, submissions, grades,
      announcements). The app itself never hard-deletes a user.
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
    `ownerId` (feature 19; exactly one of the two, checked); block JSON; a
    heading may carry `startSec`. A private note's cards and questions have
    `noteId` and no `lessonId`, and are saved `published` (no review step).
  - `flashcards` (front, back, topic, startSec), and `card_reviews`
    holding FSRS state per (student, card): due, stability (days),
    difficulty, reps, lapses, lastReview, state. No row = new, due now.
  - `quiz_questions` (type, difficulty, bank practice/graded, options,
    correctIndex, explanation, startSec). A question in a graded quiz is
    in the `graded` bank and never served to practice.
  - `graded_quizzes` (lessonId, title, questionIds, dueAt, maxAttempts,
    points), `quiz_attempts` (userId, lessonId or noteId — exactly one,
    checked; a private note's practice records the note — mode,
    gradedQuizId, startedAt, submittedAt, score 0–1) and `quiz_answers`
    (attemptId, questionId, answer, correct). Answers are scored on the
    server only.
  - A graded attempt can be submitted until the due date plus 10 minutes
    (feature 24). Until then a submit returns the score and right/wrong
    per question. The correct answers and explanations are revealed after
    that deadline: the Quiz tab's "Review answers" shows the best attempt.
  - Students see an item only when it is published and the lesson is
    visible to them.
- Documents (feature 18): `documents` (lessonId, or ownerId plus noteId for
  a private upload — the note it became; exactly one of lessonId and
  ownerId, checked; kind pdf/docx/url/audio/youtube; title, filename, blobUrl,
  pathname, url, contentType, sizeBytes, pageCount, durationSec, text,
  parts jsonb of `{text, page?, section?, startSec?, endSec?}`, status
  uploading/processing/ready/failed, error, createdBy). Students see a
  ready document once its lesson is visible to them. Files are opened
  through `/documents/[id]`, which checks access, then redirects.
- Podcasts (feature 17): `podcasts` (lessonId or noteId, length, script
  jsonb of `{speaker, text, spoken}` lines, audioUrl, audioPathname,
  durationSec, status generating/ready/failed, error, sourceHash,
  promptsVersion, requestedBy). One row per (lesson, length), shared by the
  course. `sourceHash` (SHA-256 of the published notes it was made from)
  and `promptsVersion` belong to the stored audio: while both match, the
  podcast is never made again. A private note's podcast (feature 19) is one
  row per (note, length), made from the note, its MP3 in
  `private/{ownerId}/`; the owner may remake it when stale.
  - Each row also has a `language`: `en` or `hinglish` (Hindi in
    Devanagari, English terms in Latin letters). The unique keys include
    it, so every lesson or note has one episode per language.
  - Each language is made, cached and permissioned on its own. The
    Podcast tab switches between them.
- Coursework (feature 20):
  - `assignments`: one per assignment lesson (lessonId unique):
    instructions (Markdown), dueAt, points, allowLate, category
    (homework/project/quiz/exam). The lesson's title is its title.
  - `submissions`: one per (assignment, student): text, files jsonb of
    `{url, pathname, name, contentType, size}`, submittedAt, late, status
    `submitted` (queued) / `graded` (draft grade, staff only) /
    `returned` (the student sees it). Replaceable until graded. No
    cascade from assignments: a lesson with work can't be deleted.
  - `grades`: submissionId or gradedQuizAttemptId (exactly one), userId,
    score (≤ maxScore, checked), maxScore, feedback (Markdown), gradedBy,
    gradedAt. Quiz grades aren't stored: the gradebook reads the best
    attempt × points.
  - `grade_categories` (courseId, category, weight): no rows = equal
    weights.
- Student activity:
  - `watch_progress`: (userId, lessonId) key, positionSec,
    watchedRanges (jsonb, merged `[start, end]` pairs), completedAt
    (90% watched or "Mark complete"; never cleared).
  - `lesson_notes`: userId, lessonId, atSec, text.
- Communication (feature 21). Everything belongs to a course and follows
  its lessons' visibility: staff see all of it; students see it while
  actively enrolled in the published course, and anything tied to a
  lesson only while that lesson and its module are published.
  - `events`: courseId, lessonId (the lesson a due date or quiz belongs
    to; cascade), kind `due | quiz | live | custom`, title, at, url (an
    in-app path, or an http(s) link for a live session), sourceId,
    createdBy.
    - `due` and `quiz` events are written in the same batch as saving the
      assignment or creating the graded quiz. There is one event per
      source (unique `(kind, sourceId)`), so a new due date moves it.
    - A due event shows its lesson's current title. Staff add `live` and
      `custom` events by hand.
  - `announcements`: courseId, authorId, title, body (Markdown),
    createdAt.
  - `discussions`: courseId, lessonId (set null if the lesson goes),
    authorId, title, body, status `open | answered`.
  - `discussion_replies`: discussionId, authorId, body, isAnswer (at most
    one per thread: partial unique index), createdAt. Only staff mark the
    answer, which sets the thread's status.
  - `notifications`: userId, kind `grade_returned | announcement |
    discussion_reply | due_soon | draft_ready` (the last since feature
    30, migration 0019), title, url (always an in-app path), readAt,
    dedupeKey (unique per user; the due-soon task and the drafts notice
    set it). Personal: only the recipient reads or updates them. Read ones
    go after 90 days (below).
- Assistant: `chat_threads` (user, course, lesson or null for
  course-wide, title; or a private note's chat with `noteId` and no course
  — exactly one, checked) and `chat_turns` (role, content with `[S#]`
  markers, citations jsonb — `[S1]` is `citations[0]`, each with its
  `courseId` — `refused`, `retrieved_chunk_ids`). Personal; `demo:reset`
  clears them. Analytics over questions (feature 22) must leave out note
  threads: they are private.
- Invitations (feature 22): `invitations`: email (lowercase), name, role,
  courseId and sectionId (null for an invitation to the university with no
  course), clerkInvitationId, invitedBy, createdAt, acceptedAt. There is
  one row per (email, course), with `UNIQUE NULLS NOT DISTINCT`. Clerk
  sends the email and carries the role; this row remembers the courses.
  The person's first sync (`syncUserFromClerk` → `applyPendingInvitations`)
  enrolls them (students) or adds them to `course_staff` (instructors),
  sets `acceptedAt` and writes `invitation.accept` audit rows.
- Jobs: `jobs` (Trigger.dev run ID, stage, status).
- Data exports (feature 33): `data_exports`.
  - Fields: userId, status building/ready/failed, blobUrl, pathname,
    sizeBytes, error, createdAt, readyAt, and expiresAt (7 days after the
    request).
  - Personal: only the owner reads them, through `/exports/[id]`.
  - At most 3 per person per 24 hours.
- Logging: `ai_usage` and `audit_log`. `audit_log (created_at, id)` is
  indexed for the admin page, which reads it newest first (feature 30).
- Retention (feature 30, daily `prune-old-rows`):
  - Read notifications older than 90 days are deleted.
  - Finished jobs (completed, failed, cancelled) that finished more than
    90 days ago are deleted, except each entity's newest run of each
    kind: the editor, the review screen and a private note read that one
    for their state.
  - `ai_usage` and `audit_log` are kept.
  - Data exports past `expiresAt` go, the file first, then the row
    (feature 33).
  - A deleted account still not erased an hour later is erased there, up
    to 20 a run (feature 33).

**pgvector** holds `content_chunks`: text, embedding (`vector(1536)`,
HNSW cosine), model, a generated `tsv` (GIN), courseId, lessonId/noteId,
ownerId (for private uploads), kind (`video`/`doc`/`note`), documentId and
section (feature 18), and either `startSec`/`endSec` or `page`. A lesson's
index holds its transcript and every ready document, rebuilt together. Publish (review screen or the builder's
row, one path since feature 27) queues `index-lesson`; Unpublish deletes the lesson's
chunks in the same batch. Course or module status needs no clean-up: the
search's access filter checks them. A private note's chunks (feature 19)
have ownerId and noteId and no course; `index-note` replaces them in one
batch, and they go with the note.

**Vercel Blob** holds the files:

- `videos/{lessonId}/source.mp4 | poster.jpg | captions.vtt`
- `docs/…`, `podcasts/…`, `submissions/…`, `private/{userId}/…`
- `exports/{userId}/…json`: data exports (feature 33), written by the
  `export-user-data` task, never uploaded.

The database stores only the key, size, MIME type and checksum.

Files go when what they belong to is deleted:
- A replaced video's files go when the new one is ready.
- A removed document's file goes with it.
- A private note's files go with the note.
- Deleting a lesson or module (feature 26), or a whole course (feature
  35), first cancels its unfinished runs, then deletes the rows, then its
  videos, posters, captions, documents and podcasts.
- Erasing a deleted account (feature 33) cancels the person's runs,
  deletes the rows, then everything under `private/{userId}/` and
  `exports/{userId}/`, listed from Blob. Submission files stay with the
  submissions.
- The seeded demo lecture's files (`demo/lecture/`) are never deleted.

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
  - `user.deleted` marks the row deleted and starts `erase-user`
    (feature 33). So does an admin's **Delete user**, which deletes the
    Clerk account first. Both use one idempotency key, so the erase never
    runs twice. A deleted row is never updated by a later sync.
- **Course access** lives in Neon only: `course_staff` for instructors and
  `enrollments` for students.
- **Demo accounts:**
  - A seed script creates the Clerk users (via the Backend API) and their
    Neon rows.
  - When `DEMO_MODE=true`, the sign-in page lists the demo accounts.
  - Picking one signs in with a Clerk **sign-in token**, so no password is
    typed.
  - With `DEMO_PASSCODE` set (required on a production deployment), the
    picker asks for it first and shows no password. While demo mode is
    on, nothing can grant lasting access: role changes, invitations and
    roster import are refused (feature 24).
- **Catalog fields** (title, summary, outcomes, instructor, lesson count,
  length) of a published course in the current term are visible to every
  signed-in user (`lib/db/catalog.ts`). Nothing below that level is.
  - Since feature 34, signed-out visitors see some of them too, on the
    landing page: title, summary, instructor, lesson count and length
    (not the outcomes), plus the cover tint.
  - `listPublicCatalog` selects only those columns: no id, code or
    outcomes, since the page is static HTML anyone can read.
  - The course page, lessons, the assistant and everything below still
    need a session and their usual checks.
- Students read only **published** lessons of courses they are enrolled in.
  "Published" means the course, the lesson's module and the lesson are all
  published, and the enrollment is `active` (dropped enrollments are kept
  for audit). Admins count as staff on every course.
  Presigned video, poster and caption URLs are issued only after that check,
  and they expire.
- Only a course's instructors and admins can upload, edit, publish or grade.
- A lesson is published only through `publishLessonWithContent`
  (feature 27): with its drafted content, and a video lesson only with a
  ready video. A lesson changes type only while it's empty (no video,
  documents, assignment or generated content), checked in the UPDATE.
- A course is deleted only by its staff, and only while nobody depends on
  it: no active enrollment, no submission, no submitted graded attempt,
  no pending invitation (feature 35). This is checked inside the DELETE.
  Any other course is unpublished; its records stay.
- **Learners and progress** (feature 31): a course's staff (and admins)
  see the progress of the students actively enrolled in it: lessons,
  quizzes, work and grades, as the gradebook already did. A student sees
  only their own, on `/progress`. Neither reads a student's assistant
  chats or private space, and there are no rankings. Another course's
  student report or CSV is a 404.
- **Student view** (feature 28): instructors get into a course's student
  pages (course page, its assistant, lesson preview) only for courses they
  teach. The page sends any other instructor to `/instructor`. They see
  drafts marked as drafts and record no progress, under the Student view
  banner. The student sidebar pages stay students-and-admins only.
  `/instructor/view-as-student` picks the course from `course_staff`.
- A `course_staff` row grants staff access to its course whatever the
  person's role. So changing a role (admin Users page, feature 22) changes
  access too, in the same batch:
  - Made a student: their `course_staff` rows are deleted.
  - Made staff from a student: their active enrollments are dropped (kept
    for audit).
  - The role is set in Clerk first, then Neon.
- A student's private uploads, notes, cards, chats and attempts are visible
  only to them (feature 19). Every query filters on `ownerId = current
  user` with **no staff or admin override**: an admin opening
  `/space/[noteId]` gets a 404, the file route refuses them, their search
  can't reach the chunks, and they can't watch the note's jobs. Audit rows
  about private notes carry ids only (no title, file name or Blob URL),
  because admins read the audit log. Uploads go to `private/{userId}/` only
  for a document the uploader owns.
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
   and extracts video. (The one encode is a podcast's joined MP3: a few
   minutes of speech, made on demand.)
9. **Every AI call is logged in `ai_usage`, charged to a person.** Work a
   person starts is checked against their daily AI limit first
   (`checkBudget`, feature 25). That limit is the only ceiling: credits,
   top-ups and per-course budgets are out of scope.
10. **All rendered Markdown and HTML is sanitized.** Only KaTeX output
    keeps inline styles. Model answers and posts show raw HTML as text.
    User-supplied URLs go through the SSRF guard.
11. **Styling uses `ui-context.md` tokens only.**
12. **The browser talks only to hosts in the CSP** (`next.config.ts`). A
    new external host (a CDN, an API called from the client) is added
    there, or the feature breaks with a console CSP error. Every
    Playwright test fails on one. Blob files load from this app's own
    store only (`BLOB_PUBLIC_HOST`).
13. **The server starts only with a valid config** (`lib/env.ts`). A new
    environment variable goes into its schema and `example.env`, marked
    required or optional.
