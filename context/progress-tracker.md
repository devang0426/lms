# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 2 (Video) is done: features 09 (storage, jobs, AI runtime), 10
  (video upload and processing), 11 (lesson player) and 12 (AI lesson
  content and review).
- Phase 3 (Course assistant) is done: features 13 (indexing and
  retrieval) and 14 (the course assistant). Next is feature 15
  (flashcards).
- Open: the app feels slow. Measured 2026-09-28: each Neon query is
  ~310 ms from here (us-east-2), 1–2.4 s after idle, and pages make
  several in sequence (pages took 1.9–3.5 s on the production server).
  `.trigger/tmp` holds 5.6 GB of old dev-worker bundles. Fixes proposed,
  not started (see Session Notes).
- Blocking the demo's real content: the demo lecture still has to be
  recorded (see Open Questions). The seeded lecture is the looped test
  video.

## Current Goal

- Build toward the **demo script** in `project-overview.md` at the lowest
  possible running cost. Each phase below ends in something that can be
  demoed.

## Completed

- Design system extracted into `ui-context.md`.
- NitroAI code (`lib/`, `ytdlp.mjs`) reviewed, with a per-module plan
  (`architecture.md`).
- Product scope settled:
  - One university, one deployment.
  - The university pays for AI.
  - Students can upload their own material.
  - Video lessons with timestamped Q&A.
  - The assistant refuses off-syllabus questions.
- Stack settled: Clerk, Neon + Drizzle, Trigger.dev, plain MP4 on Vercel Blob,
  Vercel.
- Context files written.
- **Feature 01, design system CSS (2026-09-25):**
  - Tokens are in `app/globals.css`: CSS variables plus the Tailwind v4
    `@theme` mapping for colors, fonts, the type scale, radii and shadows.
    `bg-stripe`, `bg-stripe-clay` and the focus ring are there too.
  - Instrument Serif, Geist and Geist Mono are loaded with `next/font` in
    `app/layout.tsx`, and the title is now "Studyhall".
  - A token preview page is at `/`.
  - The boilerplate SVGs are removed.
  - `npm run build` passes.
- **Feature 02, database and auth (2026-09-25):**
  - Drizzle on Neon (HTTP driver) with base tables (`users`, `terms`,
    `audit_log`, `ai_usage`) and pgvector 0.8.6. Migrations are applied.
  - Clerk: `proxy.ts` redirects signed-out users; styled `/sign-in` and
    `/sign-up`.
  - User-sync webhook plus lazy sync on first request.
  - `lib/auth` role helpers, and a `/no-access` page.
  - Verified: the redirect, the webhook rejecting unsigned requests, and no
    secrets in the client bundle.
  - Confirmed: a real sign-up (the owner's own account) created a
    `student` row through lazy sync.
  - Still to confirm: role changes take effect.
- **Feature 03, demo accounts and seed (2026-09-25):**
  - `npm run db:seed` creates Demo Admin (Prof. Meera Rao) and Demo
    Student (Aanya Sharma) in Clerk and Neon, plus the "Autumn 2026" term.
    It's idempotent.
  - `/sign-in` and `/sign-up` show both accounts with email and password
    visible, plus one-click "Continue as…" buttons that sign in with a
    Clerk sign-in token. The button creates the account first if it's
    missing.
  - "Switch demo account" is in the user menu.
  - Only active when `DEMO_MODE=true`.
  - `npm run demo:reset` signs out demo sessions and restores both
    accounts. Every later feature that stores student activity must add
    its cleanup to `RESET_STEPS` in `scripts/reset-demo.ts`.

- **Feature 04, UI components (2026-09-25):**
  - 30+ primitives in `components/ui/` (buttons, inputs, chips, badges,
    cards, course cards, progress, tabs, nav, tables, accordion, identity,
    dialog, menu, toast).
  - Built on Radix, sonner and Lucide, with a theme-aware `cn()`.
  - A `/dev/ui` gallery shows every variant.
  - The build and lint are clean, with no hex values outside
    `globals.css`.
  - To do in a browser: a visual check and a keyboard pass at `/dev/ui`.

- **Feature 05, port the NitroAI `lib/` (2026-09-25):**
  - AI code moved to `lib/ai/` and made server-only. Desktop, publik and
    BYO-key code deleted.
  - `getEngine()` added. PDF uses `unpdf`, with per-page text.
    Server-side markdown sanitizing. YouTube VTT cues keep their
    timestamps.
  - tsc 0 errors (was 33). 121 tests pass. Lint has 0 warnings. The
    `server-only` guard is proven. The live OpenRouter smoke test passes.
  - The old browser pipeline is parked in `lib/ai/legacy/` until feature
    10.

- **Feature 06, app shells and navigation (2026-09-25):**
  - Route groups `(student)` (with nested `(sidebar)`, `(topnav)` and
    `(focus)` shells), `(instructor)/instructor` and `(admin)/admin`. Every
    layout is a server component that calls `requireAreaRole()`, which
    sends a mismatched role to its own home (student `/`, staff
    `/instructor`). Admin can visit everything and sees both the Teaching
    and Admin sections.
  - `components/shell/`: sidebar shell (248px Oat, logo, nav, notice card,
    user block), top-nav shell (course detail), focus header (lesson
    player), page header and placeholder, error view. Active nav item via
    `usePathname`.
  - New user menu (Radix): name, role, "Switch demo account" in demo mode,
    and sign out with Clerk `<SignOutButton>`.
  - Mobile below 768px: students get the bottom tab bar (Home, Explore,
    Courses, Profile). The new `/profile` page holds the account actions and
    the sections the tab bar leaves out. Staff get a menu button.
  - Styled placeholder pages for every nav item, plus `not-found.tsx` and
    `error.tsx` (root and one per shell, so the nav stays usable).
  - The token preview moved from `/` to `/dev/tokens`.
  - Build (25 routes), lint and 121 tests pass.
  - Still to check in a browser: the demo sign-in landing pages, the
    student redirect away from `/instructor` and `/admin`, and no horizontal
    scroll at 390px.

- **Feature 07, courses, modules, lessons (2026-09-25):**
  - Migration `0002_courses_modules_lessons` (applied): `courses`,
    `sections`, `course_staff`, `enrollments`, `modules`, `lessons`.
  - Scoped queries in `lib/db/courses.ts`; the access check is inside
    each SQL query. Students see a lesson only when course, module and
    lesson are published and they are actively enrolled.
    `requireCourseStaff` / `requireEnrollment` are real now (404 on
    mismatch).
  - Instructor course list, new course and builder (rename, add, delete,
    up/down reorder, publish toggles, course details). Server actions
    follow zod, then staff check, then write + `audit_log` in one batch,
    then `revalidatePath`, and return `ActionResult`.
  - Admin enrollment screens: search students, add, remove (soft drop).
  - Student side wired up: `/courses` lists enrolled courses; course
    detail and the lesson page 404 for drafts or unenrolled users.
  - `seedCourse()`: MATH 201 · Linear Algebra, admin as instructor,
    student enrolled in Section A, 3 modules / 8 lessons (some drafts).
    Ran twice; idempotent.
  - New primitives: `Select` (native) and an `xs` button size.
  - Verified: 22 access checks against the database (student, admin,
    non-enrolled user, draft course, malformed id), build (29 routes),
    lint, 121 tests.
  - Still to check in a browser: the builder's click paths as the demo
    admin, and the student's course and lesson pages.

- **Feature 08, student screens (2026-09-25):**
  - Student home, catalog, My courses and course detail built from
    wireframes 02–04 and 07, with seeded data.
  - `lib/db/catalog.ts` for catalog and card summaries (published lessons
    only). 22 query checks passed against the database.
  - Catalog search and filters are all in the URL (`q`, `subject`,
    `level`, `sort`), so the back button works.
  - Greeting and date follow the browser's clock. Mobile home uses the
    Clay "Continue" card and the compact course list.
  - Non-enrolled students get a catalog preview of a course (no lesson
    titles or links) instead of a 404; see Architecture Decisions.
  - `lib/utils/format.ts` (length, greeting, progress) with 9 tests. New
    `dropdown` button variant; `coverClass` exported from the course card.
  - Build, lint and 130 tests pass.
  - Still to check in a browser: the screens against the wireframes, and
    `/` at 390px.

- **Feature 09, storage, jobs and AI runtime (2026-09-27):**
  - Vercel Blob client uploads: `lib/storage/` (pathnames, per-kind
    rules, pure authorization with 7 tests, `put`/`del`/`head` helpers),
    `app/api/blob/upload` (`handleUpload`), and a browser hook with the
    local-dev confirm fallback.
  - Trigger.dev v4.6.4: `trigger.config.ts` (react-server condition,
    ffmpeg), `trigger/hello.ts`, shared progress helpers, `jobs` table,
    `lib/jobs` (start, scoped Realtime token, reconcile), `JobProgress`.
  - `ai_usage` logging: the engine's `onUsage` hook plus
    `withUsage(feature, userId, fn)`. Real OpenRouter costs; speech calls
    are estimated and flagged.
  - Migration 0003 (applied): `jobs`, and `ai_usage.task`, `.estimated`
    and 10-decimal cost.
  - Verified: `hello` with the AI call ran end to end on the dev worker,
    the jobs row went through every stage to completed, and an
    `ai_usage` row was written with its real cost. A run that failed
    before starting is reconciled to `failed`. Over HTTP: a signed-out
    token request gets 403, a forged completion callback is rejected,
    and `/dev/jobs` redirects to sign-in. Build, lint, 141 tests.
  - Deployed to Trigger.dev prod (version 20260928.2). To get there,
    `lib/db/client` now connects lazily (the indexer imports tasks with
    no env) and the config has a literal project-ref fallback.
  - Still to check in a browser: `/dev/jobs` upload and live progress as
    the admin.

- **Feature 10, video upload and processing (2026-09-28):**
  - Migration 0004 (applied): `videos`, `transcript_segments`
    (with `video_id`).
  - Tasks `video-process` → `video-probe`, `video-faststart`,
    `video-poster`, `transcribe-lesson` (Trigger.dev, ffmpeg, idempotent
    steps, progress to the parent run and the jobs row).
  - Lesson editor page with drop zone, live `JobProgress`, retry, and a
    preview player with captions once ready. Builder rows link to it.
  - Pure `lib/video/` helpers (VTT, probe verdicts, MP4 atom order) with
    tests. `lib/ai/legacy/` deleted.
  - Verified on the dev worker with real Blob and Whisper:
    - A 20-minute H.264 lecture reached `ready` (faststart remux, poster,
      VTT, 254 segments, largest gap 0.87 s).
    - HEVC and `.mov` were rejected with the friendly message.
    - A re-run did no work; a retry after a failure skipped done steps.
  - Build, lint and 142 tests pass. Tasks redeployed to Trigger.dev prod.
  - Fixed on the way: Whisper rejects the tiny last audio piece → pieces
    under 1 s are skipped.
  - Still to check in a browser: the drop-zone upload and reopening the
    editor mid-process.

- **Feature 11, lesson player (2026-09-28):**
  - Migration 0005 (applied): `watch_progress` (key userId + lessonId,
    positionSec, watchedRanges jsonb, completedAt) and `lesson_notes`.
  - `/courses/[courseId]/lessons/[lessonId]` (wireframe 05):
    - `getLessonForUser` gates the page before any video URL loads.
      Anyone else gets a 404.
    - Focus header with a real "done / total" and **Mark complete**.
    - The video, then a title row with Previous and **Next lesson**.
    - Tabs: Notes, Transcript, Resources and Discussion. Resources and
      Discussion are empty states until features 18 and 21. A Chapters
      tab appears once feature 12 provides chapters.
    - The 380px Oat course contents, with step indicators.
  - `components/player/`:
    - `PlayerProvider` owns the time (throttled to 4 Hz) and `seek(sec)`.
    - `VideoPlayer`: native `<video>`, poster and caption track. Mono
      controls: play, time, a Butter scrubber with chapter markers, speed,
      CC and full screen, plus keyboard keys.
    - `TranscriptPanel`: the highlight follows playback and a click seeks.
      It auto-scrolls until the student scrolls, then offers "Follow
      along".
    - `NotesTab`: a note is pinned to the moment typing starts, and its
      "04:12" chip seeks.
    - Also `ChapterList`, `CourseContents` and `MarkCompleteButton`.
  - Progress:
    - The player records watched ranges and saves them through a server
      action at most every 15 s.
    - On `pagehide` and on unmount it sends a beacon to `/api/progress`,
      which uses the same save path (`lib/video/progress.ts`).
    - The server merges the ranges, clamps them to the video's length and
      completes the lesson at 90%.
    - Resume: `?t=` wins. Otherwise the saved position, unless it is
      within 10 s of the end.
  - Home, My courses and course detail now use real progress:
    - Completed-lesson counts.
    - "Continue" goes to the last-watched unfinished lesson, else the
      first unfinished one.
    - Course detail step indicators show done lessons.
  - Staff preview:
    - Instructors and admins open the same player, drafts included. It
      shows a "Preview" badge and records nothing.
    - The lesson editor has a "Preview as student" link.
    - Instructors now get through the `(student)` and `(focus)` layouts
      only; the sidebar and top-nav shells still send them to
      `/instructor`.
  - `lib/time.ts` (`formatTime`, `parseT`) and `lib/video/watch.ts` (range
    merging, the 90% rule, resume, active segment), with 20 tests.
  - `npm run demo:reset` now clears watch progress and lesson notes.
  - Verified: 27 checks against the database:
    - Access: an unenrolled user gets nothing, the student can't see
      drafts, the admin can preview.
    - The playback payload: URL, poster, VTT and 254 segments.
    - Progress: invalid input is rejected, 89% is not complete, crossing
      90% completes the lesson once, and ranges are merged and clamped.
    - Mark complete is idempotent.
    - Home counts and "Continue" are right.
    - Notes can only be read or deleted by their owner.
    - A staff preview saves nothing.
  - Verified over HTTP: signed out, the lesson page and the beacon both
    redirect, and the HTML has no Blob URL. Build (29 routes), lint and
    162 tests pass.
  - Still to check in a browser:
    - `?t=768` plays from 12:48.
    - A transcript click seeks, and the highlight follows playback.
    - A note taken at 04:12 shows "04:12".
    - A reload resumes, and 90% watched updates home.
    - The only processed video is on a **draft** lesson ("Eigenvectors,
      visually"), so for now only the admin preview can play it. To test
      as the student, publish that lesson and its module, or wait for
      feature 12's seeded lecture.
  - Lint now ignores `.trigger/**`: the local dev worker's generated
    bundles caused about 10k false problems. `.trigger/` should probably
    go in `.gitignore` too (done in feature 12).

- **Feature 12, AI lesson content and review (2026-09-28):**
  - Migration 0006 (applied): `chapters`, `notes` (one per lesson),
    `flashcards`, `quiz_questions` (type, difficulty, bank), each with
    `videoId` and `promptsVersion`. `Block` gained an optional `startSec`.
  - Prompts v2 (`PROMPTS_VERSION` 2):
    - `chaptersSystem` / `chaptersSchema`.
    - `noteSectionSystem` also takes one chapter (its `##` heading is the
      chapter title).
    - `lectureOverviewSystem` (the merge).
    - Chapter-tagged `lessonCardsSystem` and `lessonQuizSystem`.
  - Generation (`lib/ai/generation/`):
    - `chapters.ts`: `[mm:ss]` transcript, snapping, merging chapters
      under 20 s apart, and a coverage check.
    - `lesson.ts`: notes 4 chapters at a time, the overview merge, cards,
      and 3×8 quiz questions with answerability checks.
    - `retry.ts`: retry once, then a readable `GenerationError`.
  - Tasks `generate-chapters`, `-notes`, `-cards`, `-quiz`: one queue
    (`lesson-ai`, 3 at a time), idempotent per video, and `force` to
    regenerate. `video-process` runs them after marking the video ready.
    Progress was rescaled so the AI steps get 62–100%, and
    `VIDEO_STAGES` now lists them.
  - Review screen `/instructor/courses/[courseId]/lessons/[lessonId]/review`:
    - Tabs Chapters, Notes (a block editor sending Markdown per block,
      parsed on the server), Flashcards and Quiz.
    - Inline edits, add and delete, and time chips linking to the player.
    - Regenerate per tab (confirm dialog, live `JobProgress`).
    - **Publish**, which puts the lesson and all its items live in one
      batch with an audit row.
    - The lesson editor has an "AI drafts" card linking to it.
  - Player: chapters in a Chapters tab and on the scrubber. When notes are
    published there's a "Study notes" tab (the personal tab becomes "My
    notes"), rendered on the server with KaTeX and sanitized. Each timed
    heading has a "▶ 12:48" chip that seeks.
  - Seed:
    - `seedLecture()` loads `scripts/demo-assets/lecture.json` into "Linear
      combinations and span" and publishes it (and its module).
    - A re-run keeps edits.
    - `npm run demo:export-lecture` writes the fixture and copies the
      files to `demo/lecture/`, which `deleteBlobs()` never deletes.
  - Engine: request timeouts (180 s non-streaming, 90 s stream idle), then
    the next model. Structured lesson calls use the `strong` tier with a
    `maxTokens` cap. See Architecture Decisions.
  - Verified with the real models on the 20-minute test lecture (full
    redraft about 5 minutes, about 3¢):
    - 13 chapters across all 20 minutes.
    - 263 note blocks with 13 timed headings.
    - 31 cards and 24 questions (8/8/8).
  - The first real run caught two problems that the unit tests didn't:
    chapters bunched into 45 s, and a 15-minute stall on a hung model.
    Both are fixed.
  - Verified with 18 database checks:
    - The student sees the seeded lecture with the demo files, 13 sorted
      chapters, timed headings matching them, 31 cards and 24 answerable
      questions.
    - An outsider sees nothing. Draft content is hidden from students but
      shown in the staff preview.
    - Edits persist and are scoped to their lesson. A note save keeps its
      status.
    - Publish sets everything published but a draft module still hides it.
      The data was restored afterwards.
  - `db:seed` was run twice: the first loaded the lecture, the second kept
    it. Build (31 routes), lint and 190 tests pass.
  - Fixed on the way: the build crashed in PostCSS because Tailwind was
    scanning `.trigger/` (2.4 GB of dev-worker bundles). `/.trigger/` is
    now in `.gitignore`. Clear `.next/` if a stale cache still crashes.
  - Not verified:
    - **The Trigger.dev task path.** The dev worker refuses to start from
      a non-interactive shell (it reads the `^4.6.4` ranges as a CI
      version mismatch). Run `npm run dev:all` in a terminal, then upload a
      video or press Regenerate.
    - **In a browser:** the review screen's edit, regenerate and publish
      clicks, the player's Study notes tab and ▶ chips, and chapters on
      the scrubber.
    - **The "within 15 s of real topic changes" check.** It needs the real
      demo lecture and its answer key; the test video repeats one script.

- **Feature 13, indexing and retrieval (2026-09-28):**
  - Migration 0007 (applied): `content_chunks` with `vector(1536)` (HNSW,
    cosine), a generated `tsv` (GIN), B-trees on course, owner and lesson,
    and the `chunk_kind` enum.
  - `lib/ai/retrieval/`:
    - `chunk-transcript.ts` (pure): 45–90 s windows, 10 s overlap, never
      across a chapter, each chunk prefixed with its chapter title. 9
      tests.
    - `fusion.ts` (pure): reciprocal rank fusion, K = 60. 4 tests.
    - `index-lesson.ts`: chunk, embed in batches of 64 with
      `text-embedding-3-small`, then replace the lesson's chunks in one
      batch. It only writes while the lesson is still published.
    - `search.ts`: `searchChunks({ userId, scope, query, k })`. It embeds
      the query (logged as `retrieval`), then gets vector top-k and
      full-text top-k in one round trip, then fuses them. Returns
      `{ chunk, similarity, ftsRank }[]`.
  - `lib/db/chunks.ts`: the access filter is inside both SQL queries.
    - A course chunk is visible to admins and course staff.
    - A student needs an active enrollment, a published course, and a
      published module and lesson.
    - A private chunk is visible only to its owner.
    - The vector query sets `hnsw.iterative_scan` so the filter can't
      starve the top-k.
  - Task `index-lesson` (queue `lesson-index`, 3 attempts). It is queued by:
    - Review → Publish.
    - The builder's lesson toggle, when the lesson has a video.
    - `video-process`, when a published lesson gets a new video.
    - The builder's Unpublish deletes the chunks in its batch instead.
  - Seed: `db:seed` indexes the demo lecture (24 passages, 0.18–1201.11 s,
    the whole lecture). A re-run keeps the existing index.
  - `npm run eval:retrieval` + `scripts/demo-assets/eval.json` (10 on, 5
    off). Result on the test lecture:
    - hit@3 10/10.
    - On-syllabus top similarity ≥ 0.327; off-syllabus ≤ 0.167, with no
      full-text hits.
    - Threshold set to **0.25** (`.env.local` and `example.env`; it was
      0.35, which would have refused a real question at 0.327).
    - A non-enrolled real user gets 0 results for the course and the lesson.
  - Verified with 18 database checks (all data restored afterwards):
    - A draft module, a draft course, a dropped enrollment and stale chunks
      of an unpublished lesson each give the student 0 results. The admin
      still sees the draft module's chunks.
    - Indexing an unpublished lesson deletes its chunks.
    - Re-indexing is idempotent. There is one model per row.
    - The Unpublish batch deletes the chunks.
    - `ai_usage` has `retrieval` and `lesson-index` rows.
  - Build, lint and the 13 new tests pass. The full suite is 199/203: 4
    tests in `lib/ai/engine/engine.test.ts` fail. They still expect the
    chains from before the "Free models first" change, so the failures
    come before this feature (see Open Questions).
  - Not verified:
    - **The Trigger.dev path** (Publish → `index-lesson` on the worker).
      The dev worker still won't start from a non-interactive shell. The
      task body (`indexLessonChunks`) was run directly. Run
      `npm run dev:all`, then press Publish.
    - **hit@3 is trivial on the test lecture.** It repeats one ~52 s
      script, so every chunk contains every answer. Re-run the eval with
      the real lecture's answer key, and re-pick the threshold then.
  - For feature 14:
    - A citation seeks to the chunk's start, which can be up to one
      window (45–90 s) before the moment the answer is taught. If the "within
      15 s" check needs it, seek to the best-matching segment inside the
      chunk.
    - The relevance gate reads the best `similarity` and whether any
      `ftsRank` is set. Full-text search requires every word to match
      (`websearch_to_tsquery`), so a hit is a strong signal.

- **Feature 14, course assistant (2026-09-28):**
  - Migration 0008 (applied): `chat_threads`, `chat_turns` (`chat_role`
    enum, citations jsonb, `refused`, `retrieved_chunk_ids`).
  - `lib/ai/assistant.ts` `answer()`:
    - Retrieves with `searchChunks` (a follow-up is searched with the
      question before it).
    - Relevance gate: best similarity under `ASSISTANT_MIN_SIMILARITY`
      (0.25) and no full-text hit → refusal with no model call.
    - Sources "[S1] Lecture 2 · 12:48 — …", streamed from the `fast` tier
      (ai_usage feature `assistant`), with the refusal token held back so
      it never flashes.
    - One retry for an empty or uncited draft (a `reset` event clears the
      text).
    - Citation check, renumbering, and chips placed on the best-matching
      transcript line inside the chunk.
  - `lib/chat/` (pure, 16 tests): answer checks, `[S#]` → sanitized
    `.cite-chip` HTML (a made-up `[S9]` renders as nothing), stacked
    markers cut to two, moment placement, labels.
  - Prompt `assistantSystem` / `assistantUser` (new, so no
    `PROMPTS_VERSION` bump).
  - `POST /api/assistant`:
    - Same-origin check and zod.
    - Signed in, then `getCourseForUser`: a user outside the course, or a
      lesson they can't see, gets 404.
    - Rate limit of 20 questions per 5 minutes (counts `chat_turns`).
    - NDJSON stream: `thread`, `delta`, `reset`, `done`, `error`.
  - UI (`components/assistant/`):
    - An Ask tab in the lesson player (This lesson / Whole course).
    - `/courses/[courseId]/assistant`, linked from course detail as "Ask
      the assistant".
    - Streaming answers with KaTeX, inline and row chips (seek in the same
      lesson, otherwise open `?t=`), and "Where was this taught?" moment
      cards.
    - The fixed refusal with a disabled "Ask your instructor".
    - Suggested prompts from chapter titles. The newest thread per scope
      is reopened.
  - `npm run demo:reset` clears the demo student's chats.
  - Verified against the real model and database:
    - All 5 off-syllabus questions are refused by the gate with 0
      `assistant` usage rows.
    - On-syllabus answers get 1–2 chips on the exact sentence (for
      example "same line" → 15:18 and 09:14, both "…their span is only
      that line").
    - "Where was this taught?" returns 3 moments with snippets.
  - Verified over HTTP on the production server (14 checks). A temporary
    Clerk user was created for the not-enrolled checks, then deleted along
    with the test chats:
    - Signed out → 307 to sign-in. A foreign Origin → 403. An empty
      question → 400.
    - A not-enrolled user → 404. A draft lesson → 404. Someone else's
      thread → 404.
    - Streaming works, with every `[S#]` backed by a citation. Threads are
      reused.
    - The course detail, assistant and player pages render for the
      student.
  - Build and lint pass. Tests: 213/217. The 4 failures are the older
    engine tests (see Open Questions).
  - Found on the way: a free model sometimes returns an empty completion
    (0 tokens) instead of an error, so the engine doesn't fall through to
    the next model. The assistant retries once. The engine itself may want
    to treat an empty stream as a failure.
  - Not verified in a browser:
    - Clicking a chip seeks the player (its time is right, see above).
    - A chip for another lesson opens it at `?t=`.
    - The streaming feel, and the maths rendering.
    - Only one lesson is indexed, so no chip points at a different lesson
      yet. The course-wide page's chips all link to it with `?t=`.

## In Progress

- None.

## Next Up

The work is broken into feature specs in `features/`, numbered 01–23;
`features/README.md` has the index. Build them in order. The phases below
are the same plan grouped for reading.

**Phase 0: Foundation**

1. ~~Design tokens and fonts in `app/globals.css` and `app/layout.tsx`.
   Remove the create-next-app page and the dark-mode defaults.~~ Done
   (feature 01).
2. ~~Build the `components/ui/` primitives from `ui-context.md`.~~ Done
   (feature 04).
3. ~~Make `lib/` compile~~ (done, feature 05):
   - Install `katex`, `marked`, `dompurify`, `uuid`, `mammoth` and `vitest`.
   - Delete the Tauri, publik, keys, prefs, localSetup, theme and `app.tsx`
     modules.
   - Get the existing tests passing.
4. ~~Set up Neon + Drizzle~~ (done, feature 02):
   - Enable pgvector.
   - First migration: users, terms, courses, sections, enrollments,
     course_staff.
5. ~~Set up Clerk~~ (done, feature 02; the demo pieces move to feature 03):
   - `proxy.ts` with `clerkMiddleware`.
   - Roles in `publicMetadata`.
   - Webhook that syncs users to Neon.
   - Seed script for demo users and courses.
   - Demo account picker that signs in with sign-in tokens, behind
     `DEMO_MODE`.

**Phase 1: LMS skeleton (demo steps 1 and 4)**

6. ~~Modules and lessons with draft/published status, plus the instructor
   course builder.~~ Done (feature 07).
7. ~~App shells and screens: Student home, Catalog, Course detail~~ Done
   (features 06 and 08). The Instructor dashboard is feature 22.

**Phase 2: Video (demo steps 2, 3 and 5)**

8. Set up Vercel Blob (client uploads through `handleUpload`, with a role
   check) and Trigger.dev with the ffmpeg
   extension. Show job progress in the UI through Realtime.
9. `video-process` task, steps 1–7:
   - Upload.
   - Probe the file.
   - Move metadata to the front (faststart).
   - Poster image.
   - Extract audio and split it into pieces.
   - Whisper, storing `transcript_segments` and VTT captions.
10. ~~Lesson player~~ (done, feature 11; chapters wait for feature 12):
    - Native `<video>` with Blob URLs (issued after the enrollment check)
      and a caption track.
    - Chapter list.
    - Transcript that follows playback and seeks on click.
    - `?t=` deep links.
11. ~~Chapters task and timestamped notes, flashcards and quiz. Instructor
    review, edit and publish screen.~~ Done (feature 12).
12. ~~Watch progress with resume, and timestamped personal notes.~~ Done
    (feature 11).

**Phase 3: Course assistant (demo step 6)**

13. ~~`index-lesson` task (chunk + embed). Hybrid retrieval scoped by
    enrollment.~~ Done (feature 13).
14. ~~Assistant chat~~ (done, feature 14):
    - Relevance gate that refuses without calling the LLM.
    - Prompt that only allows cited answers.
    - Server-side citation check.
    - Streaming answers.
    - Citation chips that seek the player or navigate to the lesson.
    - "Ask your instructor" fallback.
15. Evaluation set for a seeded lecture:
    - 10 on-syllabus questions (target: at least 8 land within 15 s).
    - 5 off-syllabus questions (target: all 5 refused).
    - Use it to tune the relevance threshold.

**Phase 4: Study tools and private space (demo steps 7 and 8)**

16. Flashcard review with per-student FSRS, and a "due today" queue.
17. Quizzes: practice and graded, with mastery.
18. Podcast generated only on demand: script, TTS, MP3 in Blob.
19. Student private space: PDF/DOCX/URL/audio ingest tasks with an SSRF
    guard, plus the NitroAI features on private notes.
20. `ai_usage` logging on every AI call (no quotas).

**Phase 5: Coursework (demo step 9)**

21. Assignments, submissions (stored in Blob), grading queue, feedback, and a
    gradebook with CSV export.
22. Calendar, announcements, discussions, in-app notifications.

**Phase 6: Hardening before a real rollout**

23. Admin screens, CSV roster import, audit log. University SSO switched on
    in Clerk.
24. Rate limits on the assistant, CSP and security headers, Neon backups.
25. Analytics: video drop-off and re-watch, most-asked topics, refusal rate.
26. Accessibility pass, mobile layouts, Playwright tests covering the demo
    script.
27. Data export and deletion.

## Open Questions

- **Clerk Dashboard, your action:**
  - Add the session-token claim `{"metadata": "{{user.public_metadata}}"}`.
  - Before deploying, add the webhook endpoint and set
    `CLERK_WEBHOOK_SIGNING_SECRET`.
  - Details are in `features/feature-02-database-and-auth.md` under
    "Manual steps".

- **Demo lecture for the seed (feature 12), your action:** the seeded
  lecture is the 20-minute *test* video (a 5-minute vectors-and-span
  script looped four times). It works end to end, but its chapters can't
  be checked against a real answer key. Once the real lecture is
  recorded: upload it to a lesson, let it process, review, then run
  `npm run demo:export-lecture -- <lessonId> "<target lesson title>"` and
  commit `scripts/demo-assets/lecture.json`.
- **Demo lecture content:** we have no rights to any existing video.
  - **Recommended:** record our own 15–25 minute lecture (slides plus voice
    is enough) with 5–8 clear topic changes. That gives us full rights and
    a known answer key for the evaluation set.
  - **Alternative:** openly licensed lectures. Check the license: MIT OCW
    is CC BY-NC-SA, and non-commercial may not cover a sales demo.
- **Demo course subject:** one course, e.g. Linear Algebra or Intro to
  Machine Learning. It needs formulas to show off KaTeX.
- **University SSO provider** (Google or Microsoft): only needed for real
  rollout. It's a Clerk dashboard toggle.
- **Data law and hosting region:** Neon and Blob store regions should match the
  university's country.
- **Grading scheme:** percentages, letter grades or GPA; category weights.
- **Blob access mode (answered 2026-09-27):** the store is **public**; a
  private `put` is refused. The demo uses public URLs with random
  suffixes, handed out only after access checks. Before a real rollout,
  create a private store and flip `BLOB_ACCESS` in `lib/storage/blob.ts`.
- **Trigger.dev deploy for feature 12, your action:** the four new tasks
  (`generate-chapters`, `-notes`, `-cards`, `-quiz`) and the changed
  `video-process` run on the local dev worker only until
  `npm run trigger:deploy` is run.
- **Trigger.dev deploy for feature 13, your action:** `index-lesson` and
  the changed `video-process` run on the local dev worker only until
  `npm run trigger:deploy` is run.
- **Stale engine tests:** 4 tests in `lib/ai/engine/engine.test.ts`
  still expect `google/gemini-2.5-flash` at the head of the chains. Since
  the "Free models first" change, the `:free` models come first. Should
  the tests be updated to the new chains, or the chains reconsidered?
- **Trigger.dev prod env vars, your action:** in the Trigger.dev
  dashboard, set `DATABASE_URL`, `DATABASE_URL_POOLED`,
  `BLOB_READ_WRITE_TOKEN` and `OPENROUTER_API_KEY` for the prod
  environment (dev runs locally from `.env.local`).
- **Vercel plan:** is Hobby acceptable for the demo, or is this a
  commercial pitch (Pro)?

## Architecture Decisions

- **`isomorphic-dompurify` for Markdown.** Notes will render in server
  components, so sanitizing has to work without a browser. The old code
  escaped everything on the server.
- **The legacy browser pipeline is parked, not deleted.** `lib/ai/legacy/`
  keeps a tested reference for the Trigger.dev rewrite (features 09 and
  10), then goes away.

- **`drizzle-orm/neon-http` driver.** Stateless HTTP, so it works on Vercel
  and in Trigger.dev with no pool to manage. The trade-off is no
  interactive transactions: use `db.batch`. Env naming: `DATABASE_URL` is
  the direct connection (migrations) and `DATABASE_URL_POOLED` is the
  pooled one (runtime).
- **Clerk is the source of truth for the role; Neon mirrors it.** Sync
  happens by webhook, plus a lazy sync on request, so local dev needs no
  tunnel. Course-level access (feature 07) lives only in Neon.

- **Tailwind color names follow the design palette** (`cream`, `paper`,
  `oat`, `ink`, `terracotta`…) rather than semantic names like `base`. The
  palette names match the design board, and `base` would clash with
  `text-base`. Semantic aliases `page`, `surface` and `sunken` exist too.

- **Vercel Blob for all files (user decision)**, replacing R2. It is the
  same platform as hosting and needs no second account, and client uploads
  handle large files. The cost: data transfer is billed, so keep demo
  videos at 720p.
- **Plain MP4 instead of a video service.** It is the cheapest option that
  works. Range requests give
  seeking. There is no transcoding, so only H.264/AAC MP4 is accepted.
  Moving metadata to the front (faststart remux) makes seeking work before
  the full file downloads.
- **Clerk for auth.** Hosted sign-in UI, roles in `publicMetadata`, sign-in
  tokens for one-click demo accounts, and SSO later without code changes.
  Enrollment data stays in Neon, so access checks run in SQL.
- **Retrieval (feature 13).**
  - Chunks are embedded first, then swapped in atomically (delete + insert
    in one batch), so a search never sees a lesson half indexed. The spec
    said delete, embed, insert.
  - The builder's publish toggle indexes too, because the transcript goes
    live with the lesson.
  - Only the transcript is indexed for now (`kind: video`). Notes and
    documents come with features 18 and 19.
  - Course or module unpublish deletes nothing: the search's SQL checks
    their status.
  - Retrieval's embedding call logs itself as `retrieval`, separate from
    the assistant's answer.
- **Neon Postgres + pgvector.** Relational data and vectors live together,
  so access filters apply inside the vector query.
- **Trigger.dev for all background work.** No timeouts, an ffmpeg
  extension, and per-step retries with idempotency. Realtime progress means
  there is no worker server and the web app runs on Vercel.
- **Refuse off-syllabus questions**, using a relevance gate before the LLM
  call and a prompt that only allows cited answers. This protects academic
  scope and also saves cost.
- **Keep Whisper segment timestamps end to end.** "Jump to where it was
  taught" depends on them.
- **Instructors publish AI content**, so instructors stay responsible for
  what the course teaches.
- **FSRS state per (student, card).** Cards are shared, but review history
  is personal.
- **No AI credits or quotas in v1.** Usage is logged only, so a budget can
  be set later from real numbers.
- **No email provider in the demo.** Notifications are in-app only.

- **Role mismatch redirects home, not to an error page.** App-shell
  layouts use `requireAreaRole()`, so a student opening `/instructor`
  lands on `/`. `requireRole()` (to `/no-access`) remains for pages and
  actions. Staff visiting `/` go to `/instructor`.
- **The catalog is visible to every signed-in user; lessons are not.**
  A published course in the current term shows its catalog fields
  (title, summary, outcomes, instructor, counts) to anyone signed in, so
  "Not enrolled" courses in the catalog open a preview instead of a 404.
  The curriculum, lesson titles and lessons still need an enrollment.
- **Students need course + module + lesson published.** The feature spec
  said course and lesson; modules have their own status, so a draft
  module hides its lessons too.
- **Pages 404, actions return errors.** A course or lesson the user may
  not see is `notFound()` on pages (no hint that a draft exists). Server
  actions return `{ ok: false, error: { code: "not_found" } }`.
- **Dropping a student is a soft delete** (`enrollments.status =
  'dropped'`), so roster history stays auditable.
- **Engine reports usage; the app attributes it.** The engine calls an
  `onUsage` hook, and `withUsage()` uses `AsyncLocalStorage` to tag calls
  with feature and user. The engine stays free of database code, and no
  call can skip logging (unattributed calls log as `untracked`).
- **Jobs rows are reconciled against Trigger.dev on read.** Task hooks
  can't cover runs that die before starting.
- **Video processing keys are per video, not per lesson.** The spec's
  `lesson:{id}:process` would dedupe a re-upload into the old run (the
  idempotency key lives 30 days), so the key includes the video id.
- **Transcripts belong to a video.** `transcript_segments.video_id` lets
  a replacement video be transcribed while the old one stays live; the
  old rows go when the new video is ready.
- **Structured lesson content uses the `strong` tier (feature 12).** The
  spec said `fast` for chapters and cards. Measured: the fast chain's
  first model took 65–80 s for a tiny JSON answer (reasoning on or off),
  and its second padded a JSON answer with 16k tokens of whitespace. On
  `strong` (gemini-2.5-flash first) chapters take 10 s and cards 19 s.
  Cost: about 1–2¢ more per lecture (the whole lecture is ~3¢). Notes
  sections stay on `fast`. Revert by changing `tier` in
  `lib/ai/generation/chapters.ts` and `lesson.ts`.
- **Free models first (2026-09-28).** To keep AI spend near zero, both
  chat chains in `lib/ai/engine/index.ts` now start with OpenRouter
  `:free` models that support json_schema output
  (`nvidia/nemotron-3-super-120b-a12b:free`, `qwen/qwen3.8-27b:free`),
  with the cheapest paid models kept behind them. Free models are
  rate-limited (~20 req/min plus a daily cap per key), so a 429 or a
  timeout falls through to the paid models; `meta/muse-*` (the priciest)
  were dropped. Whisper, Kokoro and the embedding model have no free
  versions and stay as they are (fractions of a cent per lecture).
  Trade-off: the free models are slower on structured output than
  gemini-2.5-flash (see the entry above), so pipelines can take longer.
  Not yet verified with `npm run smoke:ai` or a real lecture run.
- **Engine request timeouts (feature 12).** OpenRouter requests had no
  timeout, so one stalled upstream model hung a whole pipeline (seen: a
  flashcard step idle for 15+ minutes). Now a non-streaming request is
  abandoned after 180 s and a stream that goes quiet for 90 s, and the
  chain moves to the next model.
- **Chapters must cover the lecture.** The first real run put all nine
  chapters in the first 45 s of a 20-minute lecture. The prompt now gets
  the lecture's length, chapters under 20 s apart are merged, and an
  answer where one chapter covers more than 40% of the lecture is
  retried.
- **The note merge adds, it doesn't rewrite.** NitroAI's reduce step
  rewrote all sections, which would lose the chapter headings' times. The
  strong-tier merge here writes only an overview and key takeaways around
  the chapter sections.
- **One Publish for everything.** Review → Publish sets the lesson, its
  notes, cards and questions to published in one batch (with an audit
  row). The builder's lesson toggle still publishes the lesson alone, so
  a lesson can be live with its AI content still in draft. Chapters have
  no status of their own; they show whenever the lesson does. Editing a
  published item keeps it published; a regenerated item is a draft.
- **Regenerating replaces the tab.** Redrafting a kind deletes that kind's
  items (edits included) after a confirm dialog. Regenerating chapters
  doesn't touch the notes; the notes' heading times keep the old chapter
  starts until the notes are regenerated too.
- **Seed from a fixture, with its own files.** `seedLecture()` loads
  `scripts/demo-assets/lecture.json` instead of running the pipeline.
  `demo:export-lecture` copies the video, poster and captions to
  `demo/lecture/` in Blob, and `deleteBlobs()` never deletes that prefix,
  so replacing a lesson's video can't break the seed. The fixture holds
  public Blob URLs (unguessable, but now in the repo): fine for the demo
  store, not for a real rollout.
- **Progress is saved two ways.** The periodic save is a server action,
  as the spec says. The `pagehide` save is a `navigator.sendBeacon` to
  `/api/progress`: a server action can't be sent as a beacon, and a
  normal request is cancelled as the page unloads. Both use
  `lib/video/progress.ts`, and the route refuses a foreign `Origin`.
- **Completion is decided on the server** from the stored and reported
  ranges, clamped to the video's real length. A student could still fake
  ranges, but "Mark complete" exists anyway. The check guards against
  bugs, not cheating.
- **Staff preview records no progress.** Progress belongs to students, so
  an admin or instructor watching a lesson creates no progress rows. Their
  notes are saved, because notes belong to whoever writes them.
- **A note keeps the moment typing started**, not the moment it was
  saved. A note written while the video plays points at what it's about.
- **Nested route groups for shells.** `/courses` (sidebar),
  `/courses/[id]` (top nav) and `/courses/[id]/lessons/[id]` (focus) share
  a URL prefix but need different chrome, so each shell is its own group
  under `(student)`.

## Session Notes

- **Slowness (2026-09-28), proposed fixes, in order:**
  1. Delete `.trigger/tmp` (5.6 GB) while the dev worker is stopped.
  2. Cut sequential queries per page: run independent reads together,
     merge them into `db.batch`.
  3. Consider a Neon project in a region near the users, with the Vercel
     and Trigger.dev regions to match. A Neon project's region is fixed
     when it's created.
- **Neon from Node on a slow link:** on the owner's connection, Node's
  "happy eyeballs" gave up on each Neon connection after 250 ms (`fetch
  failed` / `ConnectTimeoutError`) while curl worked. The `db:seed`,
  `demo:reset` and `smoke:ai` scripts now pass
  `--network-family-autoselection-attempt-timeout=2000`. If `next dev`
  hits the same error, run it with
  `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`.
- In raw `sql` subqueries, name the outer table's columns literally
  (`courses.id`). Drizzle renders `${courses.id}` as a bare `"id"` in
  single-table selects, which is ambiguous or binds to the wrong table.

- `tsconfig.json` is back to excluding only `node_modules`. Everything is
  type-checked.
- Known issues for features 10 and 12 (server audio chunking; reasoning
  models with a tiny `maxTokens`) are recorded in those feature files.
- `AGENTS.md` shows as modified in git. `next dev` rewrites it (see the note
  inside the file); commit it with the next change.

- The design source is a bundled HTML file; `ui-context.md` already has
  everything from it.
- `lib/` does not compile yet. Fix it in Phase 0 step 3 before
  `npm run build` can pass.
- YouTube via yt-dlp is likely to be blocked from cloud IPs. Keep it out of
  the demo script.
