# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 2 (Video) is done: features 09 (storage, jobs, AI runtime), 10
  (video upload and processing), 11 (lesson player) and 12 (AI lesson
  content and review).
- Phase 3 (Course assistant) is done: features 13 (indexing and
  retrieval) and 14 (the course assistant).
- Phase 4 (Study tools and private space) is done: features 15
  (flashcards), 16 (quizzes and mastery), 17 (podcast), 18 (document
  ingest) and 19 (student private space, 2026-09-29).
- Phase 5 (Coursework) is done: features 20 (assignments and grading,
  built in parallel with 19) and 21 (calendar, announcements,
  discussions, notifications; 2026-09-29). Build, lint and tests pass.
- Feature 22 (dashboards and admin) is done (2026-09-29), so every demo
  step now has its screens.
- Feature 23 (hardening and demo polish) is in progress. All the local
  work is done and verified: Playwright, security headers, rate limits,
  accessibility, mobile, performance, CI config and the runbook. Still to
  do are the steps on the owner's accounts: the deployment (Vercel, a Neon
  `demo` branch, the Trigger.dev prod deploy, the Blob region), the run
  against the deployed URL, two rehearsals, and pushing for CI.
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

- **Feature 15, flashcards (2026-09-28):**
  - Migration 0009 (applied): `card_reviews`, keyed by (user, card), with
    the `card_state` enum and an index on (user, due). Deleting a card
    deletes its reviews.
  - `lib/db/study.ts`:
    - `dueCards`, `studyQueue` (due cards plus total and next-due time, in
      one round trip), `dueCountsByCourse`, `recordReview`,
      `previewCards`.
    - A student sees a card only when it is published, its lesson, module
      and course are published, and they're actively enrolled, checked in
      SQL.
    - Ratings are applied on the server with `fsrs.ts`.
  - `lib/study/cards.ts` (pure, 6 tests): the shared `StudyCard`, each
    button's interval preview (same math as the server), and the session
    queue ("Again" goes to the back).
  - `FlashcardDeck`:
    - Space flips; 1–4 rate, with the next interval under each button.
    - Session progress, "Review in video" (seeks in the player, otherwise
      opens `?t=`), an end-of-session summary, and an empty state with the
      next due time.
  - Where students see it:
    - A Flashcards tab in the player (staff preview: the whole deck,
      nothing saved).
    - `/study` across enrolled courses, with `?course=` filters and a
      "Study" nav item.
    - A "N cards due today" sidebar notice, streamed with Suspense.
  - `npm run demo:reset` clears the demo student's reviews.
  - Verified with 13 database checks (a temporary second student was
    created, then removed):
    - All 31 cards start new and due.
    - Easy → 2.80 days; Again → 10.0 minutes (and a review card goes to
      relearning); Good → 2 days.
    - Two students keep separate schedules on one card, and rated cards
      leave the due count.
    - A user who isn't enrolled, a draft card and an unpublished lesson
      all give nothing and refuse a rating.
    - The staff preview has all 31 cards.
    - When caught up, the page shows the next due time.
  - The production server renders the home notice ("31 cards due today"),
    `/study` (with a bad filter too) and the player's Flashcards tab for
    the student.
  - Build and lint pass. Tests: 219/223 (the same 4 older engine tests).
  - Not verified in a browser: flipping, the keyboard shortcuts, and
    "Review in video" seeking. The link form `?t=` and the seek call match
    the assistant's chips.

- **Feature 16, quizzes and mastery (2026-09-28):**
  - Migration 0010 (applied): `graded_quizzes`, `quiz_attempts` (with a
    `gradedQuizId` not in the spec, so attempts count per quiz; `score` is
    0–1), `quiz_answers`, and the `quiz_mode` enum.
  - `lib/study/quiz.ts` (pure, 6 tests): answer checking and the
    fill-in-the-blank normalizer (case, spacing, end punctuation,
    articles, `$…$`, and `0.50` = `.5` = `1/2`, `1,000` = `1000`).
  - `lib/db/quizzes.ts`:
    - Practice (practice bank only), re-scored on save.
    - Graded: start or resume, with the due date and attempt limit checked
      in one insert, and submit scored on the server.
    - Mastery through `masteryByTopic`, plus the bank and
      create-statements for instructors.
  - Player Quiz tab:
    - Graded list (due, points, attempts used, best score;
      Start/Continue).
    - Practice with a difficulty picker and instant feedback plus
      explanation.
    - One question at a time; graded results with explanations after
      submit.
    - Mastery bars with "Review in video" for weak topics.
    - Staff preview can practise but saves nothing and can't take graded
      quizzes.
  - Instructor: a "Graded quizzes" card on the lesson editor links to
    "Create graded quiz from bank". It has a question picker, due date in
    the instructor's time zone, attempts and points, and one audited batch
    that also moves the picked questions to the graded bank.
  - Changed in feature 12's code: regenerating a quiz level now replaces
    only the practice bank, so graded questions and students' answers
    survive.
  - `npm run demo:reset` clears the demo student's quiz attempts.
  - Verified with 16 database checks (a temporary quiz and student,
    removed afterwards):
    - Practice is scored on the server (6/8 = 0.75, stray ids ignored),
      and mastery by topic appears.
    - Picked questions leave practice, and a question from another lesson
      is refused.
    - A started attempt has no `correctIndex`, explanations or fill-in
      answer, and resumes when started again.
    - Submit scores 2/3, a second submit is refused, and another student
      can't submit it. The second attempt scores 1.0 (the fill-in answer
      " The SPAN. " is accepted), and the third is refused (limit 2).
    - Scores are saved.
    - After the due date, no new or resumed attempt is allowed, but one
      started before it can still be submitted.
  - Verified on the production server with a graded quiz in place:
    - The student's lesson page lists the quiz, and none of its question
      text or explanations, and no `correctIndex`, is in the HTML.
    - The lesson editor lists it, the create page renders the bank, and a
      student is redirected away from it.
    - Warm player requests take 2.2–2.5 s (the slowness is still open).
  - Build and lint pass. Tests: 225/229 (the same 4 older engine tests).
  - Not built: editing or deleting a graded quiz.
  - Not verified in a browser: the runner's clicks, the practice flow end
    to end through its server actions, and "Review in video" seeking.
  - Known edges:
    - Two simultaneous "Start" clicks could both pass the limit check.
    - Deleting a graded question on the review screen deletes students'
      answers to it (cascade).
    - Moving a graded question back to practice there would expose it.

- **Feature 17, podcast (2026-09-28):**
  - Migration 0011 (applied): `podcasts`, one row per (lesson, length) or
    (note, length), with `podcast_length` and `podcast_status` enums.
    `sourceHash` and `promptsVersion` belong to the stored audio (see
    Architecture Decisions).
  - `lib/ai/generation/podcast.ts`:
    - `podcastSource`: the published notes as Markdown (8k-token cap), and
      their SHA-256.
    - `generatePodcastScript`: strong tier, zod-validated, one retry; at
      least 6 lines and both speakers.
    - `synthesizePodcastLines`: TTS, 4 lines at a time, with host
      `am_michael` and guest `af_heart`.
    - The NitroAI version that glued MP3 Blobs together is gone from
      `generation/index.ts`.
  - Task `generate-podcast`:
    - Queue `podcast`, 2 at a time, no retries.
    - Steps: script → TTS per line → ffmpeg concat demuxer (0.35 s pauses,
      one encode to 64 kbps mono MP3) → `put` to
      `podcasts/{lessonId}/{length}.mp3` (random suffix) → one row update.
      The old MP3 is deleted afterwards.
    - All of a run's AI calls go in `withUsage("podcast", requestedBy)`.
    - A failure marks the podcast failed and keeps any older episode.
  - Who can start it (`lib/study/podcast.ts`, 7 tests):
    - No episode yet (or every attempt failed): staff, or the first student
      to ask.
    - Notes or prompts changed since: staff only.
    - Up to date or being made: nobody.
    - The claim in `lib/db/podcasts.ts` is one conditional upsert, so two
      clicks start one run.
  - `lib/podcast/`: the tab's data (and it marks a run that died before
    starting as failed) and `requestLessonPodcast`, which claims, starts
    the job and writes a `podcast.generate` audit row.
  - `lib/jobs`: anyone who can open the lesson can watch its podcast job.
  - Player: a Podcast tab (`components/study/podcast-tab.tsx`).
    - Before an episode exists: "Generate podcast (short)", then
      `JobProgress` with 4 stages.
    - Once it exists: the native `<audio>` player and the transcript with
      Host/Guest labels.
    - For staff when the notes changed: a "Notes changed since" badge and
      "Remake podcast".
    - Students see the tab once notes are published or an episode exists.
      Staff always see it.
  - `npm run demo:reset` deletes podcasts the demo student generated,
    MP3s included, so demo step 7 starts from the Generate button.
  - Tests: 16 new (script validation and retry, voices and order, source
    hash, the rules, the concat list). Full suite 241/245: the same 4 older
    engine tests (see Open Questions).
  - Verified against the real models, Blob and database, by running the
    task body directly on the seeded lecture as the demo student:
    - 12 lines, a 2:41 MP3 (64 kbps mono), made in 31 s, costing $0.0069.
      There were 14 `ai_usage` rows under `podcast` with the student's id:
      2 script calls (a free model, then gemini-2.5-flash) and 12 Kokoro.
    - The two voices differ: median pitch ~119 Hz (host) vs ~185 Hz
      (guest). The file is served as `audio/mpeg`.
    - Once ready, a new claim is refused for students and staff alike, so
      later visitors get the cached file.
    - While generating, a second claim is refused.
    - With the stored hash changed to fake a notes edit: staff may remake
      it and a student is refused. The row was restored afterwards.
    - A lesson without published notes refuses with a clear message.
    - The episode is still in the database (requested by the demo student),
      so the tab can be heard now. `demo:reset` removes it.
  - Build and lint pass.
  - Not verified:
    - **The Trigger.dev path** (Generate → `generate-podcast` on the worker
      → live `JobProgress`). The dev worker still won't start from a
      non-interactive shell. Run `npm run dev:all`, then run
      `npm run demo:reset` and press Generate as the student.
    - **In a browser:** the tab, the audio player, the transcript and the
      staff "Remake podcast" button.

- **Feature 18, document ingest (2026-09-29):**
  - Migration 0012 (applied):
    - `documents`: kind pdf/docx/url/audio/youtube, text, `parts` jsonb,
      and status.
    - `content_chunks.document_id` (cascade) and `.section`.
  - New dependencies: `@mozilla/readability` and `linkedom`, as the spec
    names.
  - **SSRF guard (`lib/net/`, 11 tests):**
    - http(s) only, with no credentials in the URL.
    - Every resolved address must be public. The check runs in the
      socket's own DNS lookup, so DNS rebinding can't get past it.
    - Literal private IPs and `localhost` / `.internal` names are refused
      up front.
    - Redirects are followed by hand and each hop is checked again.
    - 10 MB (counted after decompression), 15 s, HTML only.
  - **Extraction:**
    - PDF per page (unpdf). DOCX per Word heading (mammoth → HTML →
      sections).
    - Web page: guard → Readability → sections.
    - Recording: the Whisper step shared with video. It moved into
      `trigger/lib/transcribe.ts`, and `transcribe-lesson` now calls it.
    - YouTube: yt-dlp captions, or audio through Whisper. On Linux it uses
      the standalone `yt-dlp_linux` build (plain `yt-dlp` needs Python).
    - Any yt-dlp failure becomes "YouTube blocked this server — upload the
      video file instead." (or the private/removed variant).
  - **Task `ingest-document`** (queue `document-ingest`, 3 at a time, no
    retries):
    1. Extract, then mark the document ready. A retry skips this if it's
       already done.
    2. On a reading lesson with no video, redraft notes, cards and quiz
       from all its documents: the feature 12 tasks with `force`, each
       keyed per document.
    3. Index the lesson.
  - **Document mode** (`lib/ai/generation/document.ts`): notes from
    NitroAI's ported `generateNoteBody`. Cards and quiz use the lecture
    generators, with the notes' `##` sections standing in for chapters.
    No chapters, and `startSec` is null. `loadDraftSource` picks video or
    document mode. The review screen hides Chapters in document mode.
  - **Indexing:** `index-lesson` indexes the transcript plus every ready
    document (`chunk-document.ts`: within a page or section, ~1,200
    characters, headed "Title · p. 7"). The builder's publish toggle now
    indexes lessons that have documents but no video.
  - **Citations:**
    - Labels read "Week 2 slides · p. 7", "Reading · Eigenvalues" or
      "Office hours · 04:10". Document titles are looked up per answer.
    - Document chips open `/documents/[id]#page=7` in a new tab. That
      route checks access (lesson visible; students only get ready
      documents), then redirects with 307, and the browser keeps
      `#page=`.
    - `?download=1` gives the Blob download.
    - Document chips never seek the video and are never placed on its
      transcript.
  - **UI:**
    - Lesson editor: a Documents card on every lesson ("Reading material"
      on reading lessons). It has drag-and-drop upload (`lesson-document`
      kind: PDF, DOCX, audio; 200 MB), a link box for web pages and
      YouTube, per-document status, live `JobProgress`, Try again and
      Remove.
    - Reading lessons also get the "AI drafts" card.
    - Player: the Resources tab lists documents with Open and Download.
      Reading lessons show their material where the video would be.
  - Tests: 30 new (the guard, sections, chunking, labels and chips, links,
    YouTube messages, upload rules, document mode). Full suite 269/273:
    the same 4 older engine tests.
  - **Verified against the real services** by running the task's code
    directly on the published reading lesson "Notation guide", with a
    generated 30-page linear-algebra PDF (the rank–nullity theorem on
    p. 17). Everything was removed afterwards:
    - Extraction: 30 pages → 30 parts.
    - Document-mode drafts: 192 note blocks with one heading per topic,
      27 cards and 8/8/8 questions. All drafts, with no `startSec`.
    - Indexing: 30 chunks, one per page.
    - "What does the rank-nullity theorem say?" as the demo student
      (course scope) cited **"Linear algebra reading · p. 17"**. Retrieval
      put p. 17 first (similarity 0.65).
    - In lesson scope the first attempt was refused and an identical retry
      cited p. 17. The retrieval was the same both times (p. 17 at 0.65,
      over the gate), so the model gave up, not the gate: the free-model
      empty completion noted in feature 14.
    - Access: the student and admin can open the document, a non-enrolled
      user can't, and while it's being read only staff can.
    - Drafting took ~5.5 minutes.
    - Also live:
      - A DOCX split into its Word-heading sections.
      - The Wikipedia rank–nullity page became 5 named sections.
      - An http→https redirect was followed.
      - 169.254.169.254, localhost:3000, 127.0.0.1 and 10.0.0.1 were
        refused, and a PNG was refused as not HTML.
      - A YouTube lecture's captions: 125 timed parts over 9:40.
      - A missing video gave the friendly message.
      - A 2:41 MP3 was transcribed into timed segments.
    - Signed out, `/documents/[id]` redirects to sign-in, and the client
      bundles contain no Blob URLs.
  - Build and lint pass.
  - Not verified:
    - **The Trigger.dev path** (upload or link → `ingest-document` → its
      subtasks on the worker, with live progress). The dev worker still
      won't start from a non-interactive shell. Run `npm run dev:all`, then
      add a PDF to "Notation guide".
    - **In a browser:** the drop zone, the link box, Remove, the Resources
      tab, and a document chip opening the PDF at its page.
    - **YouTube from Trigger.dev's servers:** it worked from this machine,
      but cloud IPs are often blocked (expected; the message covers it).
      The audio fallback path wasn't reached, because the video had
      captions.
    - **Redirects to private addresses** are covered by the per-hop check,
      but not by a live test.

- **Feature 19, student private space (2026-09-29):**
  - Built in parallel with feature 20 (another session), coordinated over
    cross-session messages: migration order, and additive edits to the
    shared files.
  - Migration 0014 (applied): `documents.note_id`; `chat_threads.note_id`
    and `quiz_attempts.note_id`, with `course_id` and `lesson_id` now
    nullable; CHECKs that each of those rows is a course's or a note's, and
    that `notes` and `documents` have exactly one of lesson and owner.
  - **`/space`:** the student's notes as cards (kind, pages, status,
    counts, date) and a "New note" dialog: File (PDF, DOCX or audio, 200
    MB, straight from the browser to `private/{userId}/`), Link or
    YouTube. A failed upload removes its empty note. Limit: 10 new notes
    per student per hour.
  - **`/space/[noteId]`:** Notes, Flashcards, Quiz, Chat and Podcast tabs
    from the lesson player's components; live `JobProgress` while the note
    is made; "Try again"; Export (Markdown, Word, print, from
    `lib/export.ts`); Delete (with its files, and any run still going is
    cancelled).
  - **Owner only, no override:** every query filters on `ownerId`: the
    page (404), the file route, the search, card ratings, the quiz, the
    podcast and the jobs. Audit rows about private notes carry ids only,
    and a private upload's `blob.upload` row has no URL.
  - **The task:** `ingest-document` has a private path: read → the
    `generate-notes`, `-cards` and `-quiz` tasks with `{ noteId }`
    (document mode, saved published) → the new `index-note`. Every run
    carries the owner as its `concurrencyKey`, and so does a note's
    podcast. Each step skips what's saved, so "Try again" resumes.
  - **Chat:** `POST /api/space/chat`. `answer()` now takes a subject
    (course or space). New prompt `spaceAssistantSystem` (new, so no
    `PROMPTS_VERSION` bump). "Include my courses" is per question. Chips
    for course material carry their course ("MATH 201 · Lecture 2 ·
    10:48"). Fixed refusal without "Ask your instructor". The rate limit is
    shared with the course assistant (20 questions per 5 minutes). Logged
    as `space-chat`.
  - Shared on the way: the NDJSON stream (`answerStream`) and its browser
    reader (`components/assistant/stream.ts`); `embedPassages` for lesson
    and note indexing; `documentTypeFromName` for both upload UIs; the
    quiz's practice and mastery queries for lesson and note banks.
  - `npm run demo:reset` deletes the demo student's private notes and
    their files.
  - Tests: 12 new (note phases, titles and summaries; private upload
    rules; the owner's podcast rights). Full suite 300/304: the same 4
    older engine tests. Lint is clean and the build passes.
  - **Verified against the real services (45 checks)** by running the
    task's private path directly as the demo student on a generated 3-page
    PDF; everything was removed afterwards:
    - Upload rules: the owner may upload into `private/{userId}/`; the
      admin may not upload for the student's document.
    - 3 pages → 48 note blocks, 17 cards and 24 questions (8/8/8), all
      published and lesson-less; a re-run skipped; 3 chunks, the owner's,
      with no course. 145 s on the free models.
    - Owner only: the admin got nothing from the note, the dashboard, the
      file route, the search (even aimed at the student's `ownerId`), a
      card rating, the practice questions, the podcast source or the job.
      The owner got all of it.
    - All cards new and due; a "Good" rating left the queue. Practice was
      scored on the server (0.875), with mastery over 13 topics.
    - Chat: an answer cited "My revision notes · p. 2"; "What's the capital
      of France?" was refused by the gate.
    - "Include my courses": the first run cited only lecture moments,
      because 24 near-identical lecture passages crowded the 3 pages out
      of the top 8. Fixed by searching the uploads and the courses
      separately and fusing the rankings. Then two questions each cited
      both, e.g. "My revision notes · p. 2" and "MATH 201 · Lecture 2 ·
      10:48".
    - Podcast: one claim (a second was refused), 12 lines, the MP3 in
      `private/{userId}/podcast-{noteId}-short…mp3`; an up-to-date one
      isn't remade.
    - The upload's audit row had the document id and no URL. Delete
      removed the note, its document and its chunks.
    - Cost of all of it: about $0.0014 (Kokoro $0.00135, embeddings
      $0.00002; the text came from the free Nemotron model).
  - **Verified over HTTP on the production build (9 checks)** with Clerk
    sessions for both demo accounts (created, then revoked): the student
    opens their note (200) and sees it on `/space`. The demo admin gets a
    **404** on `/space/[noteId]` with no title in the page, doesn't see it
    on their own `/space`, and gets a 404 from `/api/space/chat` and from
    `/documents/[id]`. A foreign Origin is refused (403); signed out, the
    page redirects to sign-in (307).
  - **Seen on the dev worker** (a YouTube note added in the browser as
    the demo student, 12:36 IST): captions read, the note took the video's
    title, then notes (86 blocks), cards (32) and quiz (8/8/8) ran as
    child runs under the owner's concurrency key and were saved. The
    `index-note` child **crashed** (TASK_PROCESS_EXITED_WITH_NON_ZERO_CODE,
    3 attempts): the dev CLI rebuilt at 12:44 while other sessions were
    editing files and deleted the old bundle folder the run was locked to.
    That's dev-only (deployed versions don't change under a run), and the
    same code indexed this note's 31 passages fine outside the worker.
    "Try again" on the note resumes at indexing. **Still to see:** a run
    completing on the worker, and a note podcast run there.
  - Not verified:
    - **In a browser:** the New note dialog (drop, link, YouTube), the
      note page refreshing when its run ends, the tabs, the "Include my
      courses" toggle, Export and Delete.
    - **YouTube and recording notes:** they use feature 18's extraction,
      tested there, but weren't re-run as private notes.

- **Feature 20, assignments and grading (2026-09-29):**
  - Migration 0013 (applied): `assignments`, `submissions`, `grades`,
    `grade_categories`, and the `assignment_category` and
    `submission_status` enums. `grades` checks it has exactly one source
    (submission or graded-quiz attempt) and a score within `maxScore`.
  - Statuses (see Architecture Decisions): `submitted` waits in the
    queue, `graded` is a draft grade only staff see, `returned` gives the
    student the score and feedback.
  - **Student:** an assignment lesson shows, where the video would be,
    the instructions (Markdown and KaTeX, sanitized), the due date (Butter
    badge within three days) and a hand-in form: an answer plus up to 5
    files (PDF, DOCX, PNG, JPEG, text; 25 MB each) uploaded straight to
    `submissions/{assignmentId}/{userId}/`. The student can hand in
    again until it's graded. Once returned: the score (48px serif) and
    feedback. `/grades` lists every assignment and graded quiz per
    course, with a course total.
  - **Hand-in rules** in one statement: late work only if allowed, flagged
    late by the database clock; no replacing graded work. Its audit row
    is in the same batch. Each file ref is checked against Blob (it
    exists, is in that student's folder, allowed type and size). A
    resubmission keeps files by position, so the page never holds a file
    URL. Files open through `/submissions/[id]/files/[n]` (owner and
    course staff; anyone else 404).
  - **Instructor:** the lesson editor's Assignment card (instructions,
    due date in their time zone, points, category, accept late work) and
    a Submissions summary. `/instructor/grading` is the queue (oldest
    first; drafts stay in it; nav "Grading"). The grade view has the
    submission on the left and score + feedback on the right, with "Save
    and next" (returns it, opens the next) and "Save draft". A returned
    grade can be corrected.
  - **Gradebook** `/instructor/courses/[id]/gradebook` (linked from the
    course builder and the Assignment card): students × assignments and
    graded quizzes (best attempt × points), weighted total, CSV export at
    `…/gradebook/export` (UTF-8 BOM, CRLF, quoting, formula guard, points
    possible in row 2).
  - The builder refuses to delete a lesson or module with student work,
    and the database refuses too (grades are kept for audit).
  - Seed: `seedAssignment()` adds "Problem set 1: span and independence"
    to "Vectors and spaces" with the Demo Student's answer handed in, ready
    to grade (demo step 9). Ran twice; the second kept everything.
    `npm run demo:reset` deletes the student's submissions, grades and
    files, then puts the ungraded submission back.
  - Tests: 17 new (due state, the hand-in window and lock, scores,
    weights and totals, the gradebook table, CSV) plus 2 upload
    authorization tests. Full suite 291/295: the same 4 older engine
    tests. Lint is clean.
  - **Verified against the real database and Blob (43 checks)** with a
    temporary second student and an outsider, all removed afterwards:
    - Access: the outsider can't open the lesson or upload; staff can't
      hand in; a student can open only their own submission (the other
      student and the outsider get nothing, so the file route 404s); a
      student can't load the grade view or see a queue.
    - A text + real file hand-in, not late, with Blob's size and type and
      its audit row. A file ref in another student's folder, or a URL
      that isn't the stored blob, is refused.
    - After the due date: accepted and flagged late when allowed (a kept
      file stays attached), refused when not. An empty hand-in is refused.
    - Queue oldest first; "next" is right. A draft grade stays hidden
      from the student and in the queue, and locks the submission;
      returning it shows 8.5 / 10 and the feedback and takes it out of
      the queue. The database rejects a score over the maximum.
    - Gradebook: 8.5 / 10, "To grade · late", the outsider absent. The
      CSV has the BOM and CRLF, turns the name "=Test Student B, Jr." into
      a quoted `'=…` text cell, and has the score.
  - Found and fixed by those checks: a file URL outside our Blob store
    made Blob's `head()` throw, which would have crashed the hand-in; it's
    now refused as a bad file.
  - **Verified over HTTP on the local dev server (20 checks)** with real
    Clerk sessions for the demo accounts (created, then revoked) and a
    temporary student whose submission held a real file (removed):
    - Signed out, all six new routes (including the CSV export) redirect
      to sign-in, so `proxy.ts` covers them.
    - As the demo student: another student's file is a 404 with no Blob
      URL; the export is a 404; the queue and a grade view send them home;
      `/grades` shows the problem set as "Handed in" with no score; the
      assignment lesson renders the instructions (KaTeX), the due line and
      "Hand in again", with no Blob URL in the page.
    - As the demo admin: the file route redirects to the file (and adds
      `?download=1`); the export is `text/csv` as an attachment named
      `math-201-gradebook-….csv`, with the header, points-possible and
      student rows; the queue, grade view and gradebook render, with file
      links through the route only; the lesson preview shows the queue
      link; a malformed id is a 404.
  - Build passes (with feature 19's in-progress files in the tree too).
  - Not verified:
    - **In a browser:** the hand-in form (upload progress, attach and
      remove, hand in again), the grade view's Save and next, the
      gradebook's sideways scroll, and the Grades page.
    - **Opening the CSV in Excel and Google Sheets** (acceptance
      criterion; the format is built for it).

- **Podcast in two languages, English and Hinglish (2026-09-29):**
  - Asked for by the product owner. Details are in
    `features/feature-17-podcast.md` under "Addition".
  - Migration 0015 (applied): `podcasts.language`, and unique keys per
    (lesson or note, length, language).
  - A new Hinglish prompt: Hindi in Devanagari, English terms in Latin
    letters. A romanized script is retried. The English prompt and
    `PROMPTS_VERSION` are unchanged.
  - Hindi voices `hm_omega` and `hf_alpha`.
  - The Podcast tab switches between English and हिंदी + English. Each has
    its own player, transcript, Generate button and progress. This covers
    lessons and feature 19's private notes (both call sites updated).
  - `getPodcastTabs` / `getNotePodcastTabs` return both languages, already
    shaped as props.
  - Tests: 4 new. Suite 304/308 (the same 4 older engine tests). Lint and
    build pass.
  - A Trigger.dev dry run imports the podcast, ingest and video tasks.
  - Verified with the real models: a Hinglish episode for "Linear
    combinations and span" (13 lines, 3:10, $0.0073), made through the
    task code.
    - Whisper transcribed its first minute back almost word for word.
    - A second claim while it was generating was refused.
    - Both languages show as ready, and can't be generated again, for the
      student.
  - Not verified: the switch and the Hinglish Generate button in a
    browser, and a run through the Trigger.dev worker.

- **Feature 21, calendar, announcements, discussions, notifications
  (2026-09-29):**
  - Built alongside another session (features 17 and 18 and the Hinglish
    podcast). We confirmed over cross-session messages that migration 0016
    was free and that the schema had no half-done changes.
  - **Migration 0016 (applied):** `events`, `announcements`,
    `discussions`, `discussion_replies`, `notifications`, and the
    `event_kind`, `discussion_status` and `notification_kind` enums.
    - It backfills events for existing assignments and graded quizzes
      (hand-written SQL at the end of the file). The seeded problem set got
      its due date.
    - Beyond the spec: `events.lessonId` and `.createdBy`, a unique
      `(kind, sourceId)`, `notifications.dedupeKey` (unique per user), and
      at most one answer per thread (a partial unique index). See
      Architecture Decisions.
  - **Calendar.** `/calendar` has a month grid and an agenda (`?month=`,
    `?view=agenda`), grouped by the reader's own days. Date tiles are
    Butter for a deadline within three days. A handed-in due date says so.
    - Student home's "Coming up" shows the next three events. On phones
      it's a Butter notice with the next deadline.
    - Saving an assignment or creating a graded quiz writes or moves its
      event in the same batch.
    - The course builder has a new Calendar tab. Staff add live sessions
      (with the meeting link) and other events there.
  - **Announcements.** "Post announcement" is on `/instructor` and in
    Messages. One batch writes the post, notifies each student actively
    enrolled in the published course, and adds the audit row.
    - Students read announcements in a new Announcements tab on the course
      page; the notification opens it with `?tab=announcements`.
    - Staff can delete them from Messages.
  - **Discussions.**
    - Student routes: `/discussions` (All / My questions / Unanswered) and
      `/discussions/[id]`.
    - Staff routes: `/instructor/messages` (unanswered, longest waiting
      first, or all, plus announcements) and `/instructor/messages/[id]`.
    - The player's Discussion tab shows the lesson's threads with its
      count and "Ask a question".
    - **"Ask your instructor" works**: the refusal opens the new-question
      dialog pre-filled with the refused question and the lesson.
    - Staff reply with "Mark my reply as the answer" (on by default) and
      can move or clear the answer.
    - `/instructor` now has the "Unanswered questions" card. The rest of
      the dashboard stays for feature 22.
  - **Notifications.** The bell is in the sidebar's logo row on desktop,
    and in the top bar on phones and course pages. It shows a Butter
    unread count, and a menu where choosing a notification marks it read
    and opens it. It reads `GET /api/notifications` on load, navigation,
    focus and every 90 s. Triggers:
    - Grade returned: in the grading batch. "…is back" the first time,
      "…was updated" after a correction; a draft stays quiet.
    - An announcement.
    - A reply to my thread.
    - Due in 24 hours: the daily `notify-due-soon` scheduled task (06:00
      UTC), one SQL statement, deduplicated.
  - **Safety.** Every read has the course and lesson visibility rule in
    its SQL.
    - What people write for each other renders with the new
      `renderPostMarkdown`: Markdown and maths, raw HTML shown as text,
      images turned into links.
    - Event links are in-app paths or http(s) only.
    - The bell follows in-app paths only.
    - Audit rows for discussions carry ids only.
  - **Seed:** a welcome announcement, and one open question from the Demo
    Student so step 1's "Unanswered questions" isn't empty. Ran twice; the
    second run kept everything.
  - **`demo:reset`:** deletes the student's threads and replies and both
    accounts' notifications, then puts the question back.
  - Tests: 16 new (month grid and range, day grouping, tile tone, safe
    links, notification titles and time labels, where a thread opens, the
    refusal's draft, post rendering). Full suite 320/324: the same 4 older
    engine tests. Lint is clean. The build passes (4 new routes).
  - **Verified against the real database (53 checks)** with a temporary
    classmate and outsider, all removed afterwards. The checks ran the
    exact statements the actions batch:
    - "Coming up" shows the seeded due date (marked handed in); the
      outsider's calendar is empty.
    - A draft lesson's due date is hidden from the student but shown to
      staff. Re-saving moves the one event. After publishing, the event
      shows under the lesson's new title.
    - A live session keeps its external link.
    - The refusal flow end to end: the student posts about the lecture,
      and the admin sees it in "Unanswered questions" after the seeded
      one.
    - The admin replies "as the answer". The student gets one
      notification: "Prof. Meera Rao replied to “What's the capital of
      France?”", linking to `/discussions/[id]`.
    - The thread becomes answered and leaves the queue. The admin's own
      bell stays empty.
    - The author's own reply notifies no one and can't mark answers. A
      classmate's reply notifies the author.
    - The answer moves, and clears (the thread reopens). The database
      refuses two answers. A reply from another thread can't be marked.
    - The outsider can't read, post or reply.
    - Nobody can read or mark another person's notifications.
    - An announcement notifies both enrolled students, with the course
      code and the tab link, but not the author or the outsider.
    - Due soon: the student who hadn't handed in was told, while the one
      who had, staff and the outsider weren't. A second run sent nothing.
  - **Verified over HTTP on the production build (27 checks)** with Clerk
    sessions for both demo accounts (created, then revoked):
    - Signed out, all four new pages redirect to sign-in, and the
      notifications API refuses.
    - As the student:
      - Home shows "Coming up" with the problem set, and the bell.
      - October's grid and agenda list it. A bad `?month=` falls back to
        this month.
      - `/discussions` and the thread render (KaTeX, a reply box, no answer
        controls). Unknown and malformed ids are 404s.
      - `?tab=announcements` opens the welcome announcement.
      - The player shows "Discussion · 1".
      - The feed API answers.
      - Messages sends them home.
    - As the admin: the dashboard shows the seeded question and "Post
      announcement", Messages lists both, the staff thread offers "Mark my
      reply as the answer", and the builder has its Calendar tab.
  - Not verified:
    - **In a browser:** the bell's menu and polling, the "Ask your
      instructor" and "Post announcement" dialogs, replying and marking
      answers by click, the Calendar tab's form, the month grid at 390px,
      and local-time regrouping after hydration.
    - **The scheduled task on Trigger.dev.** Its body (`notifyDueSoon`)
      ran directly. The dev worker registers a dev copy of the schedule
      when it next starts; production needs `npm run trigger:deploy`. I
      didn't do a `trigger deploy --dry-run`, because a dry run's clean-up
      once deleted the running dev worker's bundle (Session Notes).
    - **`npm run demo:reset`** wasn't run: it signs out every demo
      session, and the product owner may be testing. Its two new steps
      type-check, and they reuse the seeded question helper that the seed
      exercised.

- **Feature 22, dashboards and admin (2026-09-29):**
  - The other session (lms-b2) confirmed it had no schema change in
    progress before migration 0017.
  - **Migration 0017 (applied):** `invitations` (email, name, role,
    course and section or neither, Clerk's invitation id, invitedBy,
    acceptedAt), unique per (email, course) with `NULLS NOT DISTINCT`.
  - **`/instructor`** (wireframe 06):
    - Four stat cards: active learners (7 days, of N enrolled), average
      completion, waiting for grading (Butter, with the oldest wait) and
      unanswered questions.
    - The courses table: status, learners with "active this week", a
      completion bar.
    - "Needs grading" (top 5), and feature 21's unanswered questions.
    - All of it is scoped in SQL to the viewer's courses.
  - **`/instructor/analytics`** (`?course=`):
    - A heat-strip per lecture, with chapter ticks and a sentence on where
      fewer than half are still watching.
    - Most-asked topics by chapter (from each answer's first citation).
    - The refusal rate, and AI cost per feature (30 days / all time).
    - Students only, and no names.
  - **`/admin/users`:**
    - Search and role filter.
    - Change role: Clerk first, then Neon plus `user.role_change`; not
      your own. Access follows the role (see Architecture Decisions).
    - Invite by email: a Clerk invitation, or a link for someone already
      in Clerk.
    - A Pending invitations list with Withdraw.
  - **`/admin/roster`:** CSV (file or paste), then **Check file**, then
    **Import**.
    - Every row gets a result and a reason. Bad rows are skipped and the
      good ones imported.
    - New sections are created. People without an account are invited
      and enrolled on their first sign-in.
    - Re-importing the same file changes nothing.
    - New nav item "Roster import".
  - **`/admin/terms`:** add a term, make one current.
  - **`/admin/audit`:** filter by action, entity type and who did it;
    "Older entries" pages by row id.
  - **Refactor:** `syncUserFromClerk` moved to `lib/auth/sync.ts`
    (re-exported from `lib/auth`). It uses `@clerk/backend` through
    `lib/auth/clerk.ts`, so the roster import runs outside Next.js too. It
    now also applies the user's pending invitations; a failure there never
    blocks sign-in.
  - Tests: 13 new (CSV parsing and roster rows, the heat-strip and
    drop-off, topics by chapter, the refusal rate, completion maths).
    Full suite 333/337: the same 4 older engine tests. Lint is clean. The
    build passes (1 new route).
  - **Verified against the real database and Clerk (49 checks).** It used
    temporary users, a `+clerk_test` Clerk user and invitation (Clerk
    doesn't email those), all removed afterwards:
    - **Dashboard numbers match hand-written SQL:** learners, published
      lessons, completions and the completion %, distinct learners across
      courses, unanswered questions and the grading queue. A fresh watch
      makes the demo student active. An outsider isn't counted. A student
      sees no numbers.
    - **Heat-strip:** it has the demo student's ranges (not the admin's or
      an outsider's), warm at 2:00 and 10:50, cold at 7:00.
    - **Topics:** two answers land in their chapter. Staff questions are
      ignored. The refusal counts. No names.
    - **Roster:** the preview wrote nothing and classified all 7 rows
      right. The import enrolled 1, invited 1, reported 3 errors and left
      2 unchanged.
      - The new section was created. The invitation carries course,
        section and Clerk's id, and Clerk shows it pending with role
        student.
      - Both the import and each row are audited. A second import changed
        nothing.
      - The invitee's first sync enrolled them and marked it accepted; a
        second sync did nothing.
    - **Role change:** Clerk, then Neon. The demoted instructor lost their
      course; `user.role_change` is in the log.
    - **Audit filters:** by who and by what. Paging two at a time visited
      every row once, in order.
  - Found and fixed by those checks: the audit log's "Older" cursor used a
    JavaScript timestamp. It dropped Postgres's microseconds and skipped
    rows written in the same batch, so the cursor is now the row id.
  - **Verified over HTTP on the production build (28 checks)** with Clerk
    sessions for both demo accounts (created, then revoked):
    - All six pages redirect a signed-out visitor, and send the demo
      student home.
    - As the admin:
      - The dashboard shows the four cards, MATH 201 with its completion
        bar, and Aanya's problem set in "Needs grading".
      - Analytics has the lecture's strip and no student names, and falls
        back on a bad `?course=`.
      - Users shows both accounts, with the admin's own role locked.
        Search and filter work.
      - Roster, Terms ("Autumn 2026 · Current") and the audit log render,
        filtered or not, even with junk parameters.
      - The nav has Roster import.
  - Not verified:
    - **In a browser:** the role-change dialog, Invite, Withdraw, the
      roster's file picker and results table, New term / Make current,
      and the dashboard at 390px.
    - **A real person accepting an invitation in the browser:** Clerk's
      sign-up with the invitation ticket. The enrollment step after it was
      tested; the Clerk ticket flow wasn't.

## In Progress

- **Feature 23, hardening and demo polish (started 2026-09-29).** Local
  work done:
  - **Playwright** (`e2e/`; how to run it is in `e2e/README.md`):
    - One test per demo step, signing in with the picker's ticket.
    - axe (WCAG 2.2 AA) on 15 pages; keyboard tests for the player,
      flashcards, quiz and assistant.
    - 390px layouts, and the lesson page's LCP.
    - Every test fails on a CSP violation, an uncaught error or a
      hydration mismatch. It runs on installed Chrome, because the lecture
      is H.264.
  - **Security:**
    - CSP and headers in `next.config.ts`. The Clerk host comes from the
      publishable key; Blob and Trigger.dev are allowed; there are no
      wildcard script hosts.
    - `npm run check:secrets` scans the client bundle after a build.
    - Upload rate limit: students 30 an hour, staff 120, checked before a
      Blob token.
    - CI (`.github/workflows/ci.yml`): lint, unit tests, build, secret
      check; e2e on demand against a URL.
  - **Accessibility:**
    - Captions on by default.
    - The player is a tab stop with its keys described.
    - Quiz answers are a proper radio group (one tab stop, arrows).
    - Maths has MathML for screen readers (KaTeX `htmlAndMathml`, with
      `semantics` and `annotation` kept by the sanitizer).
    - Calendar contrast fixed.
  - **Performance:** the transcript is virtualized from 400 lines.
  - **Fixed on the way:** the 4 stale engine tests now read their models
    from the chain config. The suite is green: 339/339.
  - **The runbook:** `context/demo-runbook.md`.
  - **Verified locally** (production build, installed Chrome):
    - Demo steps 1, 3, 4, 5, 6, 7 and 9 pass; 2 and 8 need
      `E2E_UPLOAD=1` plus the worker.
    - Step 6 used the real model: an answer with a citation that seeks
      the video, the refusal, then "Ask your instructor" posted.
    - axe: no serious or critical issue on 15 pages (after fixing the
      calendar's contrast).
    - All 4 keyboard tests and all 3 mobile tests pass.
    - Lesson page LCP 4.1 s from the laptop.
    - No secrets in the client bundle (64 files, 6 real values, 6
      shapes).
    - No CSP violation on any page the tests visited.
  - Found by the tests and fixed:
    - The quiz's arrow keys moved from the chosen answer, not the focused
      one.
    - The player region couldn't take focus, so its keys only worked
      from a control.
    - Maths was silent for screen readers.
    - The out-of-month calendar days were below contrast.
    - Also: a test that edits a flashcard now waits for each save and
      restores the card in a `finally`. One run had left " (checked)" on
      a card, which was fixed straight away.
  - The local run changed the demo data like a rehearsal (Aanya's problem
    set graded, a question posted, a note, a card rating, a quiz attempt).
    `npm run demo:reset` puts it back.
  - **Still to do** (needs the owner's accounts and go-ahead): the
    deployment per the runbook's one-time setup, Playwright against the
    deployed URL (with `E2E_UPLOAD=1` and `E2E_ASSERT_LCP=1`), two
    rehearsals with `demo:reset` in between, and a push so CI runs (with
    the repository secrets set).

- **Running cost at demo usage (2026-09-29, for feature 23):**
  - **OpenRouter (from `ai_usage`):** $0.1436 for all 330 AI calls since
    AI went live (27–29 Sep). That covers three days of heavy development:
    two full 20-minute lecture drafts, a 30-page PDF, several podcasts,
    private notes and dozens of assistant questions.
    - The biggest items: lesson quizzes $0.031, Whisper $0.030, cards
      $0.020, notes $0.018, podcasts $0.014 (plus $0.009 private).
    - The assistant, retrieval and chat cost ~$0, because free models
      answer and embeddings are fractions of a cent.
    - One rehearsal (a live 2-minute upload, the assistant, a podcast, a
      private note) is about 2–5¢. So **20 rehearsals a month ≈ $1**, and
      a month like this development week ≈ $1.50.
  - **Everything else is on free tiers** at demo usage:
    - Vercel Hobby (see the Vercel plan question).
    - Neon free (the dev and `demo` branches).
    - Clerk free (2 demo users).
    - Trigger.dev free: a few compute-minutes per lecture.
    - Vercel Blob: the demo lecture is 10.8 MB, so views cost little
      transfer.
  - **Monthly total at demo usage: about $1–2, all of it OpenRouter.**
    Re-check once the real (longer, 720p) lecture is uploaded: Blob
    transfer grows with every full view.

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
   (features 06 and 08). ~~The Instructor dashboard~~ Done (feature 22).

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

16. ~~Flashcard review with per-student FSRS, and a "due today" queue.~~
    Done (feature 15).
17. ~~Quizzes: practice and graded, with mastery.~~ Done (feature 16).
18. ~~Podcast generated only on demand: script, TTS, MP3 in Blob.~~ Done
    (feature 17).
19. ~~Student private space: PDF/DOCX/URL/audio ingest tasks with an SSRF
    guard (the ingest task and the guard are done, feature 18), plus the
    NitroAI features on private notes.~~ Done (feature 19).
20. `ai_usage` logging on every AI call (no quotas).

**Phase 5: Coursework (demo step 9)**

21. ~~Assignments, submissions (stored in Blob), grading queue, feedback, and a
    gradebook with CSV export.~~ Done (feature 20).
22. ~~Calendar, announcements, discussions, in-app notifications.~~ Done
    (feature 21).

**Phase 6: Hardening before a real rollout**

23. ~~Admin screens, CSV roster import, audit log~~ (done, feature 22).
    University SSO switched on in Clerk is still to do (a dashboard
    toggle).
24. ~~Rate limits on the assistant, CSP and security headers~~ (done,
    features 14 and 23). Neon backups (point-in-time restore is on Neon's
    plans; check the retention) are still to do.
25. ~~Analytics: video drop-off, most-asked topics, refusal rate~~ (done,
    feature 22). Re-watches need per-view data that `watch_progress`
    doesn't keep (it stores merged ranges).
26. ~~Accessibility pass, mobile layouts, Playwright tests covering the
    demo script~~ (done locally, feature 23; the run against the
    deployment is still to do). A manual screen-reader pass (NVDA or
    VoiceOver) would still be worth doing before a real rollout.
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
  Feature 20 shows percentages and weighs the four categories equally
  (`grade_categories` is read, but there's no screen to set weights, and
  no letter grades). Totals count only graded work, so a missing
  assignment doesn't pull a total down until it's graded. Confirm, or say
  how missing work should count.
- **Feature 20 decisions to confirm:** "graded" = a draft grade the
  student can't see and "returned" = visible (feature 21's "grade
  returned" notification fits this); students may replace a submission
  until it's graded; "due soon" = within three days.
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
- **Trigger.dev deploy for feature 17, your action:** `generate-podcast`
  runs on the local dev worker only until `npm run trigger:deploy` is run.
  The deployed task needs the ffmpeg extension's `libmp3lame` (included in
  its builds; check the first prod run).
- **Trigger.dev deploy for feature 18, your action:** `ingest-document`,
  the changed `transcribe-lesson` and `index-lesson` run on the local dev
  worker only until `npm run trigger:deploy` is run. yt-dlp downloads
  itself on first use in the task (from GitHub releases).
- **Trigger.dev deploy for feature 19, your action:** the new `index-note`
  task (queue `note-index`) and the changed `ingest-document`,
  `generate-notes`, `-cards`, `-quiz` and `generate-podcast` run on the
  local dev worker only until `npm run trigger:deploy` is run.
- **Trigger.dev deploy for feature 21, your action:** the scheduled
  `notify-due-soon` task (daily at 06:00 UTC) runs in production only
  after `npm run trigger:deploy`. The deploy creates its schedule from the
  task's `cron`; check it in the dashboard's Schedules page. The dev
  worker registers a dev copy of the schedule when it starts.
- **Feature 22 decisions to confirm:**
  - **Active learners** = enrolled students who, in the last 7 days,
    watched, reviewed a card, took a quiz, asked the assistant, handed in
    work or posted in a discussion.
  - **Average completion** is per enrollment: completed published lessons
    ÷ published lessons, averaged.
  - **The heat-strip shows coverage and drop-off only.** `watch_progress`
    stores merged ranges, so re-watching isn't recorded. Showing it would
    need a per-view log (new table and player change). Is it wanted?
  - **Analytics** shows topics as counts by chapter, with no question text
    or names. AI cost is university-wide (usage isn't per course) and
    shown to every instructor.
  - **Roster import:**
    - Roles are student or instructor only; admins are made on the Users
      page.
    - Unknown sections are created (the preview says so first).
    - An existing account with a different role is an error, not a role
      change.
    - A student already enrolled in another section of the course is left
      where they are ("Already enrolled").
    - At most 500 rows or 200 KB per file.
    - The browser sends the CSV's text in a form field (it isn't uploaded
      or stored), a small exception to "file bytes never pass through
      Next.js".
  - **Changing a role changes access:** demoted instructors stop teaching,
    and promoted students leave their courses (dropped, kept for audit).
    Admins can't change their own role.
  - **Invitations go through Clerk** (it sends the email). Accepting one
    enrolls the person on their first sign-in. The Clerk ticket flow on
    `/sign-up` hasn't been tried in a browser yet.
  - **The Learners page** (instructor nav) isn't in any feature spec, so
    it's still a placeholder. Should it be part of feature 23?
- **Feature 21 decisions to confirm:**
  - The whole class reads a discussion (a course Q&A forum), with names
    shown. The "Ask your instructor" dialog says so before posting.
  - Only staff mark answers. "Unanswered questions" = threads with no
    marked answer, so a staff reply that isn't marked (a clarifying
    question) keeps the thread in the queue.
  - A thread's author is notified of replies. Staff aren't notified of new
    questions; they see them in "Unanswered questions" and Messages.
  - Staff add live sessions and other events in the course builder's
    Calendar tab. The spec lists the `live` and `custom` kinds but no place
    to add them.
  - Due-soon notices cover assignments only (as the spec says), not graded
    quizzes. A daily run means a notice comes 0–24 hours before the due
    time.
  - Not built: editing or deleting threads and replies, moderation, a full
    notifications page, and the instructor's "draft ready" notification
    from the video pipeline (`architecture.md`, step 12).
- **Feature 19 decisions to confirm:**
  - The chat searches all of the student's uploads (the spec's
    `{ownerId}` scope), not only the note it's opened from. One
    conversation is kept per note.
  - "Include my courses" is per question, off by default, and covers
    courses the student is enrolled in (or teaches). The uploads and
    courses are searched separately and fused.
  - Limits: 10 new notes per student per hour (rate limiting, not a
    quota), and 200 MB per file, the same as lesson documents.
  - Delete was added (not in the spec's list). Private cards stay out of
    `/study` and the sidebar's due count.
  - The note owner can remake a stale podcast (like staff).
- **Empty answers from free models (seen again in feature 18):** a lesson
  question with strong retrieval (similarity 0.65) was refused once
  because both attempts came back empty or uncited. Should the engine
  treat an empty completion as a failure and move to the next model
  (a small change in `lib/ai/engine/openai.ts`)?
- **Stale engine tests (resolved 2026-09-29, feature 23):** the 4 tests
  now read their models from `OPENROUTER_DEFAULT_CHAINS` instead of
  naming them, so they test the fallback behaviour whatever the order.
  Whether the chains should start with free models is still a product
  question; the tests no longer block it.
- **Feature 23, your action and go-ahead:**
  - **Deploy** per `demo-runbook.md` → One-time setup:
    - A Vercel project from the GitHub repo, with the env vars.
    - A Neon `demo` branch (migrate and seed it).
    - A Blob store in `iad1`.
    - `npm run trigger:deploy` and the Trigger.dev prod env vars.
    - The Clerk webhook.
  - **Push** to GitHub, and set the repository secrets listed in
    `.github/workflows/ci.yml`, so CI runs.
  - **Rehearse twice** with `npm run demo:reset` in between, and run the
    suite against the deployed URL.
- **Feature 23 decisions to confirm:**
  - **The CSP allows `'unsafe-inline'` scripts** (the spec puts the
    policy in `next.config.ts`, which can't carry a per-request nonce).
    For a university IT review, the stricter step is a nonce policy set in
    `proxy.ts` (Clerk's `contentSecurityPolicy: { strict: true }` option
    does this), with every page rendered per request.
  - **Captions on by default** for every lecture, not only the demo's.
    Students can turn them off; the choice isn't remembered between
    lessons.
  - **Upload limits:** 30 an hour for a student, 120 for staff.
  - **The transcript is virtualized from 400 lines.** Shorter ones stay
    whole, so find-in-page works.
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
- **Coursework (feature 20).**
  - **Draft vs returned grades.** The spec's statuses read as: `graded`
    is a saved draft only staff see, `returned` is released to the
    student (feature 21 notifies on "grade returned"). "Save and next"
    returns; "Save draft" doesn't. A returned grade can be corrected but
    never hidden again.
  - **Quiz grades are read, not copied.** A graded quiz's grade is its
    best submitted attempt × points, straight from `quiz_attempts` (as
    feature 16 planned). `grades.gradedQuizAttemptId` exists, per the
    spec, for a future instructor override; nothing writes it yet.
  - **Grades are kept.** No app path deletes a submission or grade: the
    builder refuses to delete a lesson or module with student work, and
    `submissions.assignment_id` has no cascade. Only `demo:reset` deletes
    them (the demo student's).
  - **The page never holds a submission file's URL.** Files open through
    an access-checked redirect, and a resubmission keeps files by
    position rather than by URL.
  - **Hand-in and its audit row in one transaction.** The upsert may
    refuse (closed, locked), so the audit insert selects the row whose
    `submitted_at` is `now()`: inside one transaction `now()` is fixed, so
    it matches only a row this statement just saved.

- **Hardening (feature 23).**
  - **CSP in `next.config.ts`, allowlist only.** The Clerk Frontend API
    host is decoded from the publishable key, so one config serves the
    dev and prod instances. It's stricter than Clerk's own non-strict
    default, which allows any `https:` script. A nonce policy in
    `proxy.ts` is the next step (see Open Questions).
  - **E2E on installed Chrome, not Playwright's Chromium.** The lecture is
    H.264, which open-source Chromium can't decode, so the player steps
    need the branded build. GitHub's Ubuntu runners have it.
  - **No binaries in git for the tests.** The upload clip is cut
    (`-c copy`) from the demo lecture in Blob, and the PDF is written by
    hand, both on the first run.
  - **The upload limit is checked only before a token is issued,** not in
    `authorizeUpload`. The local-dev confirm step calls that too, after
    the file is already stored, and must not refuse it.
  - **Virtualize only long transcripts.** Windowing hides lines from
    find-in-page and screen readers, so it's used only where the DOM size
    matters (400+ lines).

- **Dashboards and admin (feature 22).**
  - **Invitations wait in our own table.** Clerk invitations carry only
    the role, and enrollments need a `users` row that doesn't exist until
    sign-up. So `invitations` remembers the courses, and the person's
    first sync applies them in one audited batch. The webhook and the lazy
    sync both run `syncUserFromClerk`, so either path works.
  - **Role changes fix access in the same batch.** `staffPredicate` trusts
    `course_staff` rows whatever the role. A demoted instructor would
    otherwise keep staff access to their courses.
  - **`syncUserFromClerk` lives in `lib/auth/sync.ts`.** The roster import
    and scripts need it without `lib/auth`'s Next.js page helpers
    (`next/navigation` breaks outside Next). It also uses `@clerk/backend`
    directly (`clerkBackend()`), not the Next.js wrapper.
  - **The dashboard counts in SQL, the maths is pure.** One query gives
    each course's learners, published lessons and completions, and one
    more gives the (course, student) activity pairs. Distinct totals and
    the averages are computed in `lib/dashboard/stats.ts` (tested).
  - **The audit log pages by row id.** The first cursor used a JavaScript
    timestamp, which drops Postgres's microseconds and skipped rows from
    the same batch.

- **Communication (feature 21).**
  - **Events carry their lesson.** The spec's `events` row has only a
    course, but a due date on a draft lesson must stay hidden from
    students. `events.lessonId` lets the calendar's SQL apply the lesson's
    visibility, and deleting the lesson deletes the event.
  - **One event per source.** A unique `(kind, sourceId)` lets saving an
    assignment upsert its event in the same batch, so a new due date moves
    it. A due event shows its lesson's current title, so renames need no
    sync.
  - **Idempotent due-soon notices.** `notifications.dedupeKey` (unique per
    user) is `due:{assignmentId}:{dueAt}`. A retried or repeated daily run
    sends nothing twice, but a moved due date is announced again.
  - **Two routes per thread.** Instructors can't open the student shell,
    so staff read threads under `/instructor/messages/[id]` and students
    under `/discussions/[id]`. Both use one component. A reply
    notification links to the route for the author's role.
  - **One answer per thread in the database.** A partial unique index on
    `discussion_replies(discussion_id) where is_answer`. Moving the answer
    is clear-then-set in one batch, and the status is derived from what's
    marked.
  - **Posts render without raw HTML.** Assignment instructions and notes
    keep `renderMarkdown`, which passes HTML with `class` and `style`: that
    content is staff- or AI-written and reviewed. Students' posts are read
    by the instructor and the class, so `renderPostMarkdown` escapes raw
    HTML and turns images into links.
  - **The bell reads its own feed.** The shell layouts stay mounted across
    navigations, so a server-rendered count would go stale. The client
    bell reads `GET /api/notifications` on navigation and focus
    (throttled to 20 s) and every 90 s while visible. That's one small
    query per read, with no realtime service.

- **Private space (feature 19).**
  - **The (sidebar) shell, not a new group.** The spec says
    `app/(student)/space/`; the shells are nested groups, and the note view
    keeps the nav.
  - **One note, one source.** `documents.note_id` links a private upload to
    the note it became; the note and document are created together before
    the upload, so the dashboard shows the note while it's being made.
  - **The existing drafting tasks take a note.** `generate-notes`, `-cards`
    and `-quiz` accept `{ noteId }` instead of new tasks, and run in
    document mode for it. Indexing is a new `index-note` task, since
    `index-lesson` is tied to a published lesson and its course.
  - **Private means no override.** Admins count as staff everywhere else,
    but not here: owner-only checks come before any admin shortcut
    (including the jobs view), and audit rows about private notes carry
    ids only. The public Blob URL of a private upload is never written to
    the audit log.
  - **"Include my courses" fuses two searches.** Searching uploads and
    courses as one pool let 24 near-identical lecture passages crowd a
    3-page upload out of the top 8, so the spec's "also" didn't hold. Each
    source is searched on its own (one round trip each, in parallel) and
    the four rankings fused with RRF.
  - **The rate limit counts the audit log** (`space.note_created`), so
    deleting notes doesn't give back their slots.
  - **Shared study components take a target** (`{ lessonId }` or
    `{ noteId }`) instead of being copied for notes.

- **Documents (feature 18).**
  - **Reading lessons draft from their documents; other lessons treat
    documents as resources.** The spec says documents "go through the same
    draft pipeline". Drafting a video lesson's notes from a slide deck
    would replace the notes tied to the video's timeline, so only a
    reading lesson with no video uses document mode.
  - **Files open through `/documents/[id]`, not their Blob URL.** The
    route checks access, then redirects, so no file URL is in any page
    (invariant 4). The browser carries `#page=7` across the redirect.
  - **The SSRF check runs inside the connection's DNS lookup** (a
    `lookup` hook on `node:http(s)`), not as a separate pre-check. A
    pre-check alone can be beaten by DNS rebinding.
  - **Chunks record `document_id` and `section`** (the spec named only
    `page`), so a chip can name the document and a DOCX or web-page
    section.
  - **One index per lesson:** transcript and documents are re-embedded
    together on every index run. It's simpler than per-document updates
    and costs fractions of a cent.
- **Podcasts (feature 17).**
  - The cache key is the published notes, not the transcript. The podcast
    is made from the notes, so it never says anything students can't read.
    The key is the SHA-256 of that text plus `PROMPTS_VERSION`, stored with
    the audio. `sourceHash` isn't in the spec's schema; it is what makes
    "never regenerate while unchanged" checkable.
  - "The first student to ask" means a student can start a podcast only
    when no episode exists. Once one exists, only staff can remake it after
    the notes change, so students can't keep spending.
  - The joined MP3 is encoded once. The spec said "concat demuxer"; a
    stream copy would break if Kokoro's two OpenRouter providers returned
    different sample rates mid-episode. It's a few minutes of speech, and
    the no-transcoding rule is about video.
  - No stage-by-stage resume: the task writes nothing until the episode is
    complete, so a failed remake leaves the old one playable. A retry
    redoes the whole run (under 1¢).
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

- **Don't edit code while a dev-worker run is in flight (2026-09-29):**
  `trigger dev` rebuilds on every file change and deletes the previous
  bundle folder in `.trigger/tmp`. A child run triggered afterwards is
  still locked to the old version, can't load it, and crashes
  (TASK_PROCESS_EXITED_WITH_NON_ZERO_CODE); a private note's `index-note`
  step hit this. With several sessions editing in parallel, it happens
  easily. Test long pipelines while no one is editing, then press "Try
  again" to resume the rest. Deployed versions aren't affected.
- **Trigger.dev deploy fix (2026-09-29):**
  - The first deploy since feature 10 failed with "error importing task
    files".
  - Cause: `jsdom` (under `isomorphic-dompurify`, which `lib/markdown`
    uses since feature 12) reads `browser/default-stylesheet.css` next to
    itself on import, and bundling moves it.
  - Fix: `build.external: ["jsdom"]` in `trigger.config.ts`, so it's
    installed in the image instead. A local `trigger deploy --dry-run`
    now imports all 10 task bundles.
  - The CLI also pinned `@trigger.dev/*` to exactly `4.6.4` in
    `package.json`.
  - Still open: Trigger.dev warns the image uses Node 21 (deprecated) and
    suggests `runtime: "node-24"`.
  - Check a dry run like this before deploying after adding a dependency
    that reads its own files.
  - **Never clear `.trigger/tmp/build-*` while `npm run dev:all` is
    running.** The dev worker runs from one of those folders. Deleting it
    (as a dry-run cleanup did on 2026-09-29) makes every task started
    afterwards crash with `TASK_PROCESS_EXITED_WITH_NON_ZERO_CODE`, until
    the worker is restarted.

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
