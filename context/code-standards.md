# Code Standards

## General

- Keep modules small, with one job each. The core library split (ingest, engine,
  generation, prompts, study) is the model to follow.
- Keep business logic in pure functions (like `lib/study/fsrs.ts` and
  `lib/generation/*`) that take their dependencies (Engine, clock, db) as
  arguments. That keeps them unit-testable without a network.
- Fix root causes. Do not stack workarounds on top of each other.
- Do not mix concerns. A component does not call the AI, and a route handler
  does not render Markdown.
- Give users errors they can act on, e.g. "This audio is over 24 MB — split
  it into shorter clips". Never show raw stack traces or provider errors.

## Auth (Clerk)

- `proxy.ts` exports `clerkMiddleware()` for signed-out redirects only.
- On the server, use `auth()` / `currentUser()` from `@clerk/nextjs/server`
  through `lib/auth` helpers. Never call them straight from components.
- The role comes from `sessionClaims.metadata.role`. Enrollment and course
  staff always come from Neon.
- The demo account picker and sign-in tokens only exist when
  `DEMO_MODE=true`.
- An admin action that grants lasting access (a role, an invitation,
  course staff) refuses with `DEMO_MODE_REFUSAL` while `isDemoMode()`
  (`lib/demo/accounts.ts`, feature 24): in demo mode anyone can be the
  admin.

## TypeScript

- Strict mode everywhere. No `any`. Use explicit interfaces or narrow types.
  `unknown` plus validation is fine.
- Validate external input with zod at the boundary. That covers form data,
  route params, search params, uploaded files, webhook bodies, and **AI
  structured output**, since model JSON is untrusted.
- Shared domain types live next to the schema (`lib/db/schema.ts`) and are
  inferred from it. Do not keep a second copy by hand.
- Match exhaustively on unions with a `never` check, as `lib/ingest/index.ts`
  does.
- Use UUID strings for IDs. Store timestamps as Postgres `timestamptz`
  (IndexedDB legacy used epoch ms; convert at the boundary while porting).

## Next.js 16

Read `node_modules/next/dist/docs/` before using an API you haven't used in
this repo.

- Pages default to server components. Add `"use client"` only for
  interactivity: players, editors, flashcard flipping, chat input.
- `params` and `searchParams` are Promises. Always
  `const { id } = await params`.
- Middleware is now **`proxy.ts`**. Use it only for optimistic redirects.
  Never put authorization there.
- Use server actions for form mutations. Use route handlers (`app/api/`) for
  the Clerk webhook and streaming assistant chat.
- Every server action and route handler follows the same order:
  1. Parse the input.
  2. Get the session and check the role and ownership.
  3. Do the work or queue a job.
  4. Return a typed result.
- Caching: if Cache Components (`cacheComponents: true`) is enabled, pair
  every `"use cache"` with `cacheLife`, and tag per-user or per-course data.
  Never cache anything user-scoped without the user in the key.
- Public pages (`app/(public)/`, feature 34) stay static:
  - No `auth()`, `cookies()`, `headers()` or `searchParams`. Data is read
    at build or on the segment's `revalidate` (ISR), never per request.
  - Select only columns that may be public (`listPublicCatalog`): the HTML
    is cached and served to anyone.
  - Settings such as the institute's details come from `lib/institute.ts`
    and are read at build, so changing them means a rebuild. The build
    stops, naming the variable, if one is missing.
- Use `after()` for small fire-and-forget work such as logging. Anything that
  can take more than about a second goes to the job queue.
- Don't end a route that needs the session in a file extension
  (`/gradebook/export`, not `/gradebook.csv`): `proxy.ts`'s matcher skips
  paths that look like static files, so Clerk wouldn't run and `auth()`
  fails. Name the download with `Content-Disposition` instead.
- A server component that needs "now" (due dates) calls `requestTime()`
  from `lib/utils/clock.ts`, one value per request. `Date.now()` in a
  component body fails the `react-hooks/purity` lint rule.
- Mark server-only modules with `import "server-only"`. This applies to
  everything in `lib/ai`, `lib/db`, `lib/auth` and `lib/storage`.
- Load fonts (Instrument Serif, Geist, Geist Mono) with `next/font/google` in
  the root layout.

## Page Data and Loading (feature 29)

Every query to Neon is its own HTTPS round trip, about 310 ms from here
(`us-east-2`) and around a second after the free database has slept.
Count the round trips a page makes before it can render.

- A page reads through **one `db.batch`** after the user lookup, plus the
  lesson gate (`getLessonForUser`) where it needs one. Its loader lives in
  `lib/db/` (`player.ts`, `course-page.ts`, `builder-page.ts`,
  `lesson-editor.ts`, `lesson-review.ts`, `learners.ts`). No `await` chains, and no
  `Promise.all` of separate requests where one batch would do.
- To make a read batchable, export a builder next to the function:
  - `xQuery(...)` / `xQueries(...)` return the unawaited statement(s)
    (`as const` for a tuple).
  - `toX(rows)` shapes the rows; take them with
    `BatchRows<ReturnType<typeof xQueries>>` (`lib/db/client.ts`).
  - The old `async x()` becomes `toX(await xQuery())`.
- A read that needs another read's result uses a subquery instead:
  "the newest ready video", "the newest thread", the enrollment or staff
  course list. Don't wait for the first result.
- A statement that runs in the same batch as the access check (not
  after it) checks access itself. Use `canSeeCourse`, `isStaffOf` or
  `inCatalogCourse` (`lib/db/courses.ts`, `catalog.ts`). Invariant 4 has
  no batch exception.
- Wrap a repeated read in React `cache()`, as `getCurrentUser` and
  `dueCountsByCourse` are, and pass the same arguments (the cached user
  object). Never use `unstable_cache` or `'use cache: private'` for the
  user or anything user-scoped.
- Slow secondary panels (anything that may call Trigger.dev, or a heavy
  list under a closed tab) read in one second batch, started after the
  page's batch returns, and are awaited inside `<Suspense>` with a
  skeleton fallback. Never send it beside the page's batch: a second
  request at the same moment opens a new TLS connection (~1.1 s from
  India). Mark the promise handled (`early()` in the lesson player), so
  a failure before render isn't an unhandled rejection.
- Every section has a `loading.tsx` built from `Skeleton` pieces in the
  page's shape. A layout never awaits data that would hold the skeleton
  back: put the data in the page, or in a Suspense child that reads the
  page's cached batch.
- Every shell has an `error.tsx` that keeps its navigation and offers
  "Try again" (`retry()`) plus a way home: `ErrorView` with its `home`
  link (`components/shell/error-view.tsx`, feature 30). Put it beside the
  layout that draws the shell; where the page draws the header (the focus
  shell) or there's no layout (`(auth)`), the boundary draws
  `ErrorHeader` or `AuthShell` itself. `app/global-error.tsx` covers the
  root layout.
- Heavy client code in a tab or dialog (Markdown, KaTeX, DOMPurify) loads
  with `next/dynamic` from a `"use client"` wrapper
  (`components/player/lazy-tabs.tsx`). Next splits code only for dynamic
  imports made in client components. Better still, render the HTML on the
  server (`renderCards`) and ship none of it.
- `reconcileJob` asks Trigger.dev only about a job row untouched for
  3 minutes. Don't add other `runs.retrieve` calls to page renders.
- A streamed response writes what it doesn't need yet after the stream:
  `backgroundUsageWrites()` for `ai_usage` plus `after()`. A write that
  enforces a limit stays before the work (feature 25).
- Measure with `DB_LOG=1` on a production build (`npm run build`, then
  `next start`). Each Neon request logs its round-trip number, so a page's
  sequence of round trips is plain in the log.

## Styling

- Use only the CSS custom property tokens and Tailwind theme keys from
  `ui-context.md`. No hardcoded hex values.
- Follow the radius, spacing (4pt) and elevation scales in `ui-context.md`.
- Use Terracotta for at most one primary action per screen.
- Light theme only. Do not add `dark:` variants.
- Compose from `components/ui/` primitives. Don't restyle a primitive inline.
  Add a variant to it instead.
- A grid whose cards hold truncated text gets `minmax(0, …)` columns
  (`grid-cols-1`, `lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]`). A plain
  `fr` track grows to fit the longest line, which pushes the page wider
  than a phone (feature 31).
- Combine classes with `cn()` (`lib/utils/cn.ts`). A new `@theme` token in
  `globals.css` must also be registered in `cn()`'s tailwind-merge config.
- Pass icons to server components as elements (`<Icon icon={X} />`), never
  as component references, which can't cross into client components.
- Accessibility:
  - Use real `<button>`/`<a>`/`<label>` elements.
  - Give icon buttons an `aria-label`.
  - Give tabs `role="tablist"`/`aria-selected`.
  - Keep a visible focus ring (the Clay-tint ring).
  - Keep text contrast at AA or better.

## API Routes and Server Actions

- Validate and parse the input before any logic runs.
- Enforce auth, enrollment/course-staff scope and ownership before any read of private
  data and before any mutation.
- Return consistent shapes: `{ ok: true, data }` or
  `{ ok: false, error: { code, message } }`. Use `ActionResult`, `ok()` and
  `fail()` from `lib/utils/action-result.ts`.
- Wrap every server action in `safeAction` (`lib/utils/safe-action.ts`,
  feature 30), named for the log:
  `export const saveGrade = safeAction("saveGrade", async (…): Promise<ActionResult<…>> => { … });`.
  The name is spelled out because production builds minify function
  names away; `safe-action.test.ts` checks every `"use server"` file, so
  an unwrapped action or a mismatched name fails the tests.
  A throw (the database's "fetch failed", a bug) becomes
  `fail("internal", "Something went wrong. Try again. (ref ab12cd)")`
  plus one log line with that ref, so the page and the typed text stay.
  `redirect()` and `notFound()` still work. An action returns an
  `ActionResult`, never `void`. (The dev-only `/dev/jobs` form actions
  are the exception: they redirect.)
- A client component that awaits an action wraps the call in `settle()`
  (`lib/utils/action-result.ts`): the request itself can fail (offline, a
  new deploy), and a throw inside a transition replaces the page with the
  error page. `useAction()` in `components/course-builder` already does.
- Server errors are logged in one place, `logServerError`
  (`lib/utils/server-error.ts`): one JSON line with the route, the
  digest or ref, the Clerk user id and the error. Pages, route handlers
  and the proxy reach it through `instrumentation.ts` → `onRequestError`;
  actions through `safeAction`; a stream that has already started
  (`answerStream`) logs its own. Don't add a second path: a Sentry
  capture goes inside `logServerError` later.
- Write the `audit_log` row (`auditInsert()` from `lib/db/audit.ts`) in the
  same `db.batch` as the change it records.
- A student's private data (feature 19, `lib/db/space.ts`): filter on
  `ownerId = current user` in every query, with no staff or admin
  override, and 404 on a mismatch. Its audit rows carry ids only (no
  title, file name or Blob URL): admins read the audit log.
- Text people write for other people (feature 21: announcements,
  discussion threads and replies) renders with `renderPostMarkdown`
  (`lib/markdown.ts`), never `renderMarkdown`. Raw HTML stays text and
  images become links, so a post can't restyle or overlay the page for its
  readers. Model answers render the same way, with `renderAnswerMarkdown`
  (feature 24).
- No rendered element keeps a `style` attribute except KaTeX output. Put
  trusted HTML (like citation chips) in through `renderAnswerMarkdown`'s
  `keep()`, never by concatenating it into the Markdown.
- A new environment variable goes into `lib/env.ts` (required or optional)
  and `example.env`. The server won't start without the required ones.
- A notification is written in the same `db.batch` as the change it
  announces (`notifyStatement()` from `lib/db/notifications.ts`). Its
  `url` is always an in-app path, and the bell follows only those.
- Call Clerk's Backend API through `clerkBackend()` (`lib/auth/clerk.ts`)
  or the helpers in `lib/admin/clerk.ts`, never from components. Change
  the role in Clerk first, then mirror it into Neon with its audit row.
  Library code must not import `lib/auth/index.ts` just for
  `syncUserFromClerk`; import `lib/auth/sync.ts`. The index pulls in
  Next.js page helpers, which break in scripts.
- `db.batch` needs a plain statement first. Put a fixed statement (often
  the audit insert) before any `...spread` of optional ones, or the tuple
  type fails.
- Keyset pagination over a timestamp uses the last row's id, compared in
  SQL as `(created_at, id) < (select …)`. JavaScript dates drop Postgres's
  microseconds, and rows written in one batch share a timestamp.
- Pages use `requireCourseStaff` / `requireEnrollment` (404 on mismatch).
  Server actions call `getCourseAccess()` and return an error result. A
  page whose loader already decides access (`getCourseForUser`,
  `getLessonForUser` or a page loader's batch) calls `requireUser()` and
  404s on its result instead of checking twice (feature 29).
- Publish a lesson only with `publishLessonWithContent`
  (`lib/courses/publish.ts`, feature 27). It publishes the drafted
  content too, refuses a video lesson without a ready video, and queues
  the index.
- In raw `sql` subqueries, reference the outer table literally
  (`courses.id`), not `${courses.id}`: Drizzle renders that as a bare
  column name in single-table selects.
- Uploads go to object storage through signed URLs. The Next server doesn't
  proxy file bodies.
- Long work triggers a Trigger.dev task and returns its run ID straight away. The client
  follows it with Trigger.dev Realtime.
- Rate-limit AI endpoints per user (chat, regenerate).
- A per-person count limit must not read the count and write afterwards:
  parallel requests all pass. Put `lockFor(kind, userId)` and
  `underLimit(countSql, max, what)` (`lib/db/limits.ts`) at the start of
  the same `db.batch` as the write, and map `isLimitError(err)` to the
  refusal (feature 25). Create anything the request needs (a chat thread)
  inside that batch, not before it.

## AI and Jobs

- Only call the engine through `createEngine()` wrapped in `resilient()`.
  Never construct a provider class directly.
- Check `supportsTask()` before transcription, TTS or embeddings, and show
  `unsupportedMessage()` if the task isn't supported.
- Prompts live in `lib/ai/prompts`. Never write them inline. Bump
  `PROMPTS_VERSION` when a prompt changes, and store the version on the
  content it generated. A podcast prompt change also bumps
  `PODCAST_PROMPTS_VERSION`: stored podcasts compare only against that,
  so other prompt changes don't mark every episode stale.
- Retrieved text goes to a model inside `assistantSources()`'s `<source>`
  tags, and the prompt says it is material, never instructions
  (feature 24).
- Validate structured output against the same zod schema used for the JSON
  schema. On failure, retry once, then fail the job with a clear message:
  wrap the attempt in `withOneRetry()` (`lib/ai/generation/retry.ts`),
  which throws a `GenerationError` shown to the user as is.
- Give every structured call a `maxTokens` cap (`STRUCTURED_MAX_TOKENS`)
  large enough for reasoning. The engine abandons a non-streaming request
  after 180 s and a stream that goes quiet for 90 s, then tries the next
  model.
- Those limits are per model, so a whole chain with backoff can run for
  many minutes. A web request that calls the engine passes a `signal`
  that fires before the route's `maxDuration` (feature 30): once it
  fires, the engine tries no further model and `resilient()` stops
  retrying. The streaming routes export `maxDuration = 300` (Vercel
  Hobby's ceiling) and `answerStream` ends the answer at 240 s with "That
  took too long. Try again."
- Jobs must be idempotent and resumable per stage. Each stage saves its
  output before the next stage starts.
- Record every AI call in `ai_usage`: wrap the work in
  `withUsage(feature, userId, fn)` from `lib/ai/usage.ts`. The engine
  reports each call's tokens and cost itself; calls outside `withUsage`
  are logged as `untracked`. Pass the id of the person who started the
  work (in a task payload as `requestedBy` if it isn't the source's
  owner): a row with no user can't count against anyone's daily limit.
- Before starting AI work a person asks for, call
  `checkBudget(user, { feature, entityType, entityId })`
  (`lib/ai/budget.ts`, feature 25) and return its message when it
  refuses. It writes the `ai.limit_reached` audit row itself.
- Assistant answers go through the relevance gate first. Off-syllabus
  questions are refused **without** an LLM call. Answers with no valid
  citation are replaced by the refusal.
- Prefer the `fast` tier. Use `strong` only where `architecture.md` says
  so. Generate podcasts on demand only.
- Never flatten timestamped data (transcript segments, VTT cues) to plain
  text without keeping the segment rows. Citations need `startSec`.

## Trigger.dev Tasks

- Define tasks in `trigger/`, one file per task, with ids in kebab-case
  (`video-process`, `transcribe-lesson`).
- Keep task imports light. The worker imports every file in `trigger/` at
  startup and gives up after 20 seconds ("Worker timed out"), which a
  busy machine can reach. Code reachable from a task imports
  `lib/markdown-blocks`, never `lib/markdown`: that module loads jsdom
  (~2 s) through isomorphic-dompurify. The same goes for any other heavy
  import at module level.
- Validate task payloads with zod. A payload carries IDs only, never large
  text or file bytes. The task loads what it needs from Neon or Vercel Blob.
- Trigger tasks from server actions or webhooks with an `idempotencyKey`,
  e.g. `lesson:${id}:process`.
- Run AI-heavy tasks in named queues with concurrency limits. Use a
  per-user `concurrencyKey` for student uploads: `startJob({ concurrencyKey })`
  for the run, and the same key on each `triggerAndWait` it makes, so the
  child tasks queue per student too.
- Report progress with `reportProgress()` from `trigger/lib/job-progress.ts`
  (run metadata plus the jobs row) and spread `jobHooks` into the task.
  Stage lists go in `lib/jobs/stages.ts`. The UI uses `<JobProgress>` with
  a token from `getJobAccessToken()`, scoped to that run.
- Throw `JobError` for messages users should read; anything else is shown
  as a generic failure.
- A task whose entity has a status of its own (video, document, podcast)
  moves it off "in progress" in `onFailure`. The page that shows the
  entity also reconciles it against its latest run, because crashes skip
  the hooks. See `lib/video/recovery.ts` and `documentsForEditor`
  (feature 26).
- When `startJob` throws, mark the entity failed with a message and
  return an error; never leave it "in progress". `startJob` gives every
  run a TTL (30 minutes by default).
- Tasks stream an uploaded file to a temp file (`downloadTo` in
  `trigger/lib/video-files.ts`) rather than buffering the response
  (`res.blob()`). The default machine has 512 MB.
- Use subtasks (`triggerAndWait`) for pipeline stages, so each stage retries
  on its own.

## Video

- Upload directly from the browser with `@vercel/blob/client` `upload()`
  (`multipart: true` for video). Never send file bytes through a server
  action or route body; the function limit is ~4.5 MB anyway.
- `handleUpload` must authorize in `onBeforeGenerateToken`: check the
  Clerk session and role, restrict `allowedContentTypes`, and set
  `maximumSizeInBytes`.
- Store both the Blob `url` and `pathname` in Neon. Delete blobs with
  `deleteBlobs()` when a lesson or submission is hard-deleted. The order
  is: collect the URLs and unfinished jobs (`lessonLeftovers`), cancel the
  jobs, delete the rows, then the files, best effort (feature 26).
- Accept only MP4 with H.264/AAC. ffmpeg may only remux (`-c copy
  -movflags +faststart`) and extract (poster, audio). It never re-encodes.
- Before the upload, the browser and the server run the same check:
  `videoFileProblem` (`lib/video/upload-check.ts`, feature 27). A name
  ending in `.mp4` passes whatever type the browser reports (Windows
  often sends none); ffprobe checks the real codecs afterwards.
- Hand Blob URLs for the MP4, poster and VTT to the client only after an
  enrollment check. Never list them on pages outside the course.
- Use a native `<video>` with a `<track kind="captions">`. The player
  component owns `currentTime`. Chapters, transcript and citation chips call
  its `seek(sec)`.
- Store every time as whole or decimal **seconds** (`startSec`). Format as
  `mm:ss` / `h:mm:ss` only in the UI.
- Deep links use `?t=<seconds>` (`parseT` also takes `12m48s` and
  `12:48`). The lesson player reads it once on load; without it, it
  resumes from `watch_progress.positionSec` unless that is within 10 s of
  the end.
- Watch progress is decided on the server: the browser sends its ranges,
  the server merges them with the stored ones, clamps them to the video's
  real length and applies the 90% rule (`lib/video/watch.ts`).

## Data and Storage

- Relational data and metadata go in Postgres. Blobs go in object storage.
  The database stores only the storage key.
- Change the schema only through migrations. Never edit the database by hand.
- Soft-delete things a school may need to audit: submissions, grades, users.
  Hard-delete on a verified data-deletion request.
- A person's data (feature 33): a new table or Blob folder that holds
  something a person made or did joins the export (`userExportQueries`
  in `lib/db/data-export.ts`, shaped in `lib/account/export-document.ts`).
  It also joins the erase: `eraseUserRows` in `lib/db/user-erase.ts`
  deletes it or, if it's an academic or shared record, keeps it and says
  so there. A deleted account is anonymised ("Deleted user"), never
  hard-deleted by the app. Every foreign key to `users` names its delete
  rule: `set null` for a record that outlives the person, `cascade`
  otherwise.
- Use one embedding model. Store the model name with each vector.
- Retention (feature 30): the daily `prune-old-rows` task deletes read
  notifications and finished jobs older than 90 days, keeping each
  entity's newest run of each kind (pages read it for their state). The
  rules live in `lib/retention/rules.ts`, with tests; the SQL in
  `lib/db/retention.ts` applies them. `ai_usage` and `audit_log` are
  kept. A new table that grows with use gets a rule there, or a note
  saying why it's kept.

## Testing

- Vitest for pure logic (`npm test`). The existing `lib/**/*.test.ts`
  tests stay green. `server-only` is stubbed in `vitest.config.mts`, so
  `lib/ai` modules are testable.
- Get an engine only with `getEngine()` (`lib/ai/engine/server.ts`).
  `npm run smoke:ai` checks the live key.
- An intentionally unused name starts with `_`; ESLint ignores it.
- Give reasoning models room: never set a tiny `maxTokens` on
  `complete()`.
- Use in-memory fakes for Engine and db in unit tests. Unit tests never
  call real providers.
- Use Playwright for the success-criteria flows in `project-overview.md`
  (`e2e/`, see its README). Select by role and accessible name, as a
  screen reader would. A test that changes demo content must restore it
  in a `finally`.
- After a UI change, run `npm run e2e -- --project=a11y`: axe (WCAG 2.2
  AA) fails on serious or critical issues. Keyboard behaviour follows the
  ARIA patterns (radio groups: one tab stop, arrows move).
- After `npm run build`, `npm run check:secrets` must pass: no server-only
  value or key shape in `.next/static`.
- A new external host the browser loads from or connects to goes into the
  CSP in `next.config.ts`.
- Maths renders through `renderMath` (KaTeX, HTML plus MathML), and the
  sanitizer keeps its `semantics` and `annotation`, so screen readers get
  the formula once.

## File Organization

- `app/`: routes only: pages, layouts, loading and error states, server
  actions next to their route.
- `components/ui/`: design-system primitives.
- `components/<feature>/`: feature components.
- `lib/ai/`: engine, generation, prompts, ingest. Server-only.
- `lib/db/`: schema, migrations, scoped data-access functions.
- `lib/auth/`: session and permission helpers.
- `lib/study/`, `lib/markdown-blocks.ts` (the block model, pure), `lib/markdown.ts` (HTML rendering and sanitizing; it loads jsdom): shared logic.
- `lib/net/`: the SSRF guard. Server code fetches a user-supplied URL
  only through `safeFetchHtml` (`lib/net/safe-fetch.ts`).
- `trigger/`: Trigger.dev tasks. `trigger.config.ts` sits at the root.
- `context/`: these spec files.
