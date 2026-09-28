# Code Standards

## General

- Keep modules small, with one job each. The NitroAI split (ingest, engine,
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
  (NitroAI used epoch ms in IndexedDB; convert at the boundary while porting).

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
- Use `after()` for small fire-and-forget work such as logging. Anything that
  can take more than about a second goes to the job queue.
- Mark server-only modules with `import "server-only"`. This applies to
  everything in `lib/ai`, `lib/db`, `lib/auth` and `lib/storage`.
- Load fonts (Instrument Serif, Geist, Geist Mono) with `next/font/google` in
  the root layout.

## Styling

- Use only the CSS custom property tokens and Tailwind theme keys from
  `ui-context.md`. No hardcoded hex values.
- Follow the radius, spacing (4pt) and elevation scales in `ui-context.md`.
- Use Terracotta for at most one primary action per screen.
- Light theme only. Do not add `dark:` variants.
- Compose from `components/ui/` primitives. Don't restyle a primitive inline.
  Add a variant to it instead.
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
- Write the `audit_log` row (`auditInsert()` from `lib/db/audit.ts`) in the
  same `db.batch` as the change it records.
- Pages use `requireCourseStaff` / `requireEnrollment` (404 on mismatch).
  Server actions call `getCourseAccess()` and return an error result.
- In raw `sql` subqueries, reference the outer table literally
  (`courses.id`), not `${courses.id}`: Drizzle renders that as a bare
  column name in single-table selects.
- Uploads go to object storage through signed URLs. The Next server doesn't
  proxy file bodies.
- Long work triggers a Trigger.dev task and returns its run ID straight away. The client
  follows it with Trigger.dev Realtime.
- Rate-limit AI endpoints per user (chat, regenerate).

## AI and Jobs

- Only call the engine through `createEngine()` wrapped in `resilient()`.
  Never construct a provider class directly.
- Check `supportsTask()` before transcription, TTS or embeddings, and show
  `unsupportedMessage()` if the task isn't supported.
- Prompts live in `lib/ai/prompts`. Never write them inline. Bump
  `PROMPTS_VERSION` when a prompt changes, and store the version on the
  content it generated.
- Validate structured output against the same zod schema used for the JSON
  schema. On failure, retry once, then fail the job with a clear message:
  wrap the attempt in `withOneRetry()` (`lib/ai/generation/retry.ts`),
  which throws a `GenerationError` shown to the user as is.
- Give every structured call a `maxTokens` cap (`STRUCTURED_MAX_TOKENS`)
  large enough for reasoning. The engine abandons a non-streaming request
  after 180 s and a stream that goes quiet for 90 s, then tries the next
  model.
- Jobs must be idempotent and resumable per stage. Each stage saves its
  output before the next stage starts.
- Record every AI call in `ai_usage`: wrap the work in
  `withUsage(feature, userId, fn)` from `lib/ai/usage.ts`. The engine
  reports each call's tokens and cost itself; calls outside `withUsage`
  are logged as `untracked`. This is logging only, with no quotas.
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
- Validate task payloads with zod. A payload carries IDs only, never large
  text or file bytes. The task loads what it needs from Neon or Vercel Blob.
- Trigger tasks from server actions or webhooks with an `idempotencyKey`,
  e.g. `lesson:${id}:process`.
- Run AI-heavy tasks in named queues with concurrency limits. Use a
  per-user `concurrencyKey` for student uploads.
- Report progress with `reportProgress()` from `trigger/lib/job-progress.ts`
  (run metadata plus the jobs row) and spread `jobHooks` into the task.
  Stage lists go in `lib/jobs/stages.ts`. The UI uses `<JobProgress>` with
  a token from `getJobAccessToken()`, scoped to that run.
- Throw `JobError` for messages users should read; anything else is shown
  as a generic failure.
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
  `del()` when a lesson or submission is hard-deleted.
- Accept only MP4 with H.264/AAC. ffmpeg may only remux (`-c copy
  -movflags +faststart`) and extract (poster, audio). It never re-encodes.
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
- Use one embedding model. Store the model name with each vector.

## Testing

- Vitest for pure logic (`npm test`). The existing `lib/**/*.test.ts`
  tests stay green. `server-only` is stubbed in `vitest.config.mts`, so
  `lib/ai` modules are testable.
- Get an engine only with `getEngine()` (`lib/ai/engine/server.ts`).
  `npm run smoke:ai` checks the live key.
- An intentionally unused name starts with `_`; ESLint ignores it.
- Give reasoning models room: never set a tiny `maxTokens` on
  `complete()`.
- Use in-memory fakes for Engine and db in unit tests. Never call real
  providers in CI.
- Use Playwright for the success-criteria flows in `project-overview.md`.

## File Organization

- `app/`: routes only: pages, layouts, loading and error states, server
  actions next to their route.
- `components/ui/`: design-system primitives.
- `components/<feature>/`: feature components.
- `lib/ai/`: engine, generation, prompts, ingest. Server-only.
- `lib/db/`: schema, migrations, scoped data-access functions.
- `lib/auth/`: session and permission helpers.
- `lib/study/`, `lib/markdown.ts`: pure shared logic.
- `trigger/`: Trigger.dev tasks. `trigger.config.ts` sits at the root.
- `context/`: these spec files.
