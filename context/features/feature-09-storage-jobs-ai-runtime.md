# Feature 09: Storage, jobs and AI runtime

**Status:** Done (2026-09-27). Browser upload check pending, see below.
**Depends on:** 05, 07
**Demo step:** 2 (live progress panel)

## Goal

The infrastructure every AI feature runs on:

- Vercel Blob client uploads.
- Trigger.dev tasks with live progress in the UI.
- An AI call wrapper that logs usage.

## Scope

**In:**
- Blob upload route and helpers.
- Trigger.dev setup (with ffmpeg).
- The `jobs` table.
- The job progress component.
- `ai_usage` logging.

**Out:** the actual pipelines (10 onwards).

## Files

- `lib/storage/blob.ts`: `server-only`. `put`, `del`, `head`, and
  pathname conventions from `architecture.md`.
- `app/api/blob/upload/route.ts`: `handleUpload`.
  - `onBeforeGenerateToken` reads the Clerk user and checks the role and
    course staff, taken from `clientPayload`.
  - It sets `allowedContentTypes` and `maximumSizeInBytes` per upload kind.
  - `onUploadCompleted` records the blob. The client also calls a server
    action as the local-dev fallback.
- `trigger.config.ts`: project ref from env, `dirs: ["./trigger"]`, and
  the `ffmpeg()` build extension.
- `trigger/hello.ts`: a smoke task.
- `jobs` table: id, kind, entityType, entityId, triggerRunId, status,
  stage, progress, message, error, createdBy, createdAt, updatedAt.
- `lib/jobs.ts`:
  - `startJob(kind, entity, payload)` triggers with an `idempotencyKey`
    and inserts the `jobs` row.
  - `getJobAccessToken(jobId)` creates a public access token scoped to the
    run (`auth.createPublicToken`).
- `components/jobs/job-progress.tsx`, a client component:
  - `useRealtimeRun` from `@trigger.dev/react-hooks`.
  - Shows the stage list with step indicators, the current message, and
    an error with a retry.
- `lib/ai/usage.ts`: `withUsage(feature, userId, fn)` records tokens and
  cost in `ai_usage`. Every engine call from tasks and actions goes through
  it.

## Implementation notes

- **Task payloads** are IDs only (zod-validated). Tasks create their own
  Drizzle client from `DATABASE_URL`.
- **Progress:** tasks report stage and progress through `metadata.set(...)`
  and also mirror them to the `jobs` row, so the history survives.
- **Env vars:** set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` and
  `OPENROUTER_API_KEY` in the Trigger.dev dashboard for both the dev and
  prod environments.
- **Local dev:** run `npx trigger.dev@latest dev` alongside `next dev`.
  Add an `npm run dev:all` script.

## Acceptance criteria

- [ ] The admin uploads a test file from a dev page. It lands in Blob, and
      an unauthorized user is refused a token.
- [x] Triggering `hello` shows live progress and survives a page reload.
      (Verified end to end against the dev worker through `startJob`; the
      `jobs` row walked every stage to `completed`. The live view in a
      browser is still to be watched.)
- [x] A smoke AI call from a task writes an `ai_usage` row with a cost.
      (`hello-smoke`, chat, 30 in / 31 out, $0.0000163500, not estimated.)
- [x] `npm run build` passes, and `npx trigger.dev deploy` succeeds
      (version 20260928.2 on prod).

## As built

- **Blob store is public.** Access mode is fixed per store and a private
  `put` is refused, so every blob gets a random suffix (unguessable URL)
  and URLs are only handed out after an access check. Switching to a
  private store later is one constant, `BLOB_ACCESS` in
  `lib/storage/blob.ts`, plus signed downloads.
- **Uploads:** `lib/storage/upload-kinds.ts` (pure: pathnames, per-kind
  types and size caps: `dev-test` 10 MB, `lesson-video` MP4 2 GB
  multipart) and `lib/storage/authorize.ts` (pure, 7 tests). The route
  `app/api/blob/upload` checks the session, role or course staff, folder,
  type and size before issuing a token. `proxy.ts` lets this path through
  signed-out because Blob's completion callback has no session; Blob signs
  it. The browser hook `components/uploads/use-blob-upload.ts` uploads
  directly to Blob and then calls `confirmUpload()` (local-dev fallback),
  which re-authorizes and records the upload idempotently (`audit_log`
  `blob.upload`).
- **Jobs:** `jobs` table (migration 0003). `lib/jobs` has `startJob`,
  `getJobForViewer`, `latestJobFor`, `getJobAccessToken` (read scope for
  one run, 2 h). Stage lists live in `lib/jobs/stages.ts`, shared by tasks
  and the UI.
- **Reconcile:** task hooks don't run when a run dies before the task
  starts (bad payload, crash, expiry), which left a row "queued" forever.
  `getJobForViewer` / `latestJobFor` now check unfinished rows against the
  run's real status and fix them, and `JobProgress` refreshes only once.
- **Tasks:** `trigger.config.ts` loads `.env.local`, builds with the
  `react-server` condition (so `server-only` modules in `lib/` load in
  tasks) and the `ffmpeg()` extension. Tasks reuse `lib/db/client`
  (`DATABASE_URL_POOLED`, falling back to `DATABASE_URL`) rather than a
  second client. Helpers in `trigger/lib/job-progress.ts`: run metadata
  plus a mirror to the jobs row, lifecycle hooks, user-facing errors only.
- **AI usage:** the engine reports every successful provider call through
  an `onUsage` hook (OpenRouter's `usage.cost`, including streamed calls).
  Speech calls return no cost, so they are priced from a list and marked
  `estimated`. `withUsage(feature, userId, fn)` collects calls through
  `AsyncLocalStorage` and writes the rows even if `fn` throws. Calls
  outside it are logged as `untracked`. `ai_usage` gained `task` and
  `estimated`, and cost now has 10 decimal places.
- Check page: `/dev/jobs` (admin only): test upload, run `hello` (with or
  without the AI call), recent jobs, latest `ai_usage` rows.
- `npm run dev:all` runs `next dev` and `trigger dev` together.
- **Deploy fixes:** Trigger.dev's cloud indexer imports every task file
  and re-reads `trigger.config.ts` with no env vars. So the config falls
  back to the literal project ref (not a secret), and `lib/db/client`
  now connects on first use instead of throwing at import.
- **Prod still needs env vars** in the Trigger.dev dashboard before tasks
  can run there (see progress-tracker Open Questions).

**Still to check in a browser:** as the demo admin on `/dev/jobs`, upload
a file (and, signed in as the student, confirm the page is refused), and
watch a `hello` run live, then reload mid-run.
