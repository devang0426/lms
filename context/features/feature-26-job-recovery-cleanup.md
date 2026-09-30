# Feature 26: Job recovery and clean-up

**Status:** Done (2026-09-30). Two checks wait for the owner's worker to be
stopped: the live TTL expiry and `trigger deploy --dry-run` (see below).
**Depends on:** 24
**Demo step:** 2, 3
**Source:** `report.md` (production-readiness audit, 2026-09-29): V2, V3,
R8, and part of R5.

## Goal

A failed or orphaned background job never leaves a lesson stuck. Deleting
content removes its files and stops its jobs.

## The bug this fixes (V2)

`startVideoProcessing` (`lib/video/lessons.ts:25-56`) sets the video and
the lesson to `processing` **before** it queues the job. The only code that
ever sets a video back to `failed` is the step-failure path inside
`video-process`.

So in any of these cases the video stays `processing` for good:
- `tasks.trigger` throws (Trigger key missing or wrong, or Trigger.dev down).
- No worker picks the run up.
- The run crashes, runs out of memory or times out.
- The run is cancelled.

The task's `onFailure` hook (`trigger/lib/job-progress.ts:47`) updates only
the `jobs` row. The lesson editor then shows:
- No Retry button: it needs the video to be `failed`.
- No uploader: it's hidden while the video is `processing`.
- A disabled Publish button: it's disabled while the lesson is `processing`.

The only way out is to delete the lesson. Documents, private notes and
podcasts already recover from this case (`lib/documents/index.ts`); videos
don't.

## Scope

**In:**
- Videos that can always be retried or replaced.
- Job expiry, and a "worker offline" hint.
- Removing Blob files and cancelling jobs when a lesson or module is deleted.
- The Trigger.dev Node runtime.
- Downloading documents to disk instead of into memory.

**Out:**
- Bigger Trigger.dev machines. They cost more; deferred.
- A full-store sweep for orphaned blobs. It's optional; see task 3.

## Tasks

Web and task changes are separate steps, per `../ai-workflow-rules.md`.

### Step 1: web side

- **Queueing fails:** in `startVideoProcessing`, if `startJob` throws, set the video to `failed` with "Processing couldn't start. Try again." and restore the lesson's status. Return an error to the uploader instead of throwing.
- **Job ended but the video didn't:** when `getLessonVideoState` finds the latest job has ended without completing while the video is still `processing`, mark the video `failed` and restore the lesson status. Copy the documents pattern.
- **Job expiry:** `startJob` (`lib/jobs/index.ts:28`) passes a `ttl` (default `"30m"`). A run that no worker picks up then expires and gets reconciled.
- **Lesson editor** (`…/lessons/[lessonId]/page.tsx:146, 237`):
  - Show **Retry** whenever the latest video has failed.
  - Show the uploader whenever no job is running, so a stuck row can always be replaced.
- **`components/jobs/job-progress.tsx`:** after 3 minutes in the queue, show "Processing hasn't started. The background worker may be offline." Add a hint for local development: "Run `npm run dev:all`."

### Step 2: task side

- **`jobHooks.onFailure`:** for `video-process`, mark the video `failed` if it's still `processing` and restore the lesson's status. Do the same for any other job whose entity has a status of its own.
- **Runtime:** in `trigger.config.ts`, set `runtime: "node-22"`. Node 21 is deprecated.
  - Check it with `trigger deploy --dry-run`.
  - Remember the `jsdom` external from the Session Notes.
- **Document downloads:** `trigger/lib/ingest-document.ts:113-117` should stream the download to a temp file instead of `res.blob()`. A 200 MB file in memory can crash the default machine.

### Step 3: deleting content

- `deleteLesson` and `deleteModule` (`app/(instructor)/instructor/courses/actions.ts:199-211, 308-319`) do these, in order, like `deleteNote` in `lib/space/index.ts`:
  1. Collect the lesson's Blob URLs: videos, posters, captions, documents, podcasts. Skip the seeded demo lecture's files (`isDemoLectureUrl`).
  2. Collect its unfinished jobs.
  3. Cancel the jobs.
  4. Delete the rows.
  5. Delete the files, best effort.
- **Optional:** a weekly scheduled task that marks `uploading` video, document and note rows older than 24 hours as failed, and lists `videos/`, `docs/` and `private/` to delete blobs no row points at.
  - Each `list()` call counts as an advanced Blob operation (2,000 a month on Hobby), so keep it weekly and paged.

## Acceptance criteria

- [x] With `TRIGGER_SECRET_KEY` wrong, uploading a video ends with a clear error and Retry, not "processing".
- [ ] With the worker stopped, the run expires after the TTL. The editor then shows Retry and the uploader.
  - Checked: every run carries `ttl: "30m"`, and an expired run (`EXPIRED` → `canceled`) takes the same reconcile path as a cancelled one, which was tested live.
  - Not seen live: the owner's dev worker was running throughout.
- [x] Cancelling a run in the Trigger.dev dashboard partway through leaves Retry and the uploader showing, and the lesson back in its previous status. (Cancelled through the API while it was executing on the dev worker.)
- [x] Deleting a lesson that has a video, a document and a podcast: `headBlob` returns nothing for each file, and running jobs are cancelled. (The action's steps were run in its order against the real services; the builder's Delete button wasn't clicked.)
- [ ] `trigger deploy --dry-run` imports every task on `node-22`. Not run: its clean-up can delete a running dev worker's bundle (Session Notes), and the worker was running. The running worker did rebuild and run the changed `video-process`.
- [ ] A 150 MB PDF ingests on the default machine.
  - Measured locally with a 143 MB, 30-page PDF: peak memory rose 147 MB (to about 285 MB in all), against 440–700 MB before. The default `small-1x` machine has 512 MB.
  - Not run on a Trigger.dev machine.
- [x] Unit tests for the reconcile rule. `npm run build`, lint and tests pass.

How each was checked is in `../progress-tracker.md` (Completed → feature 26).
The optional weekly sweep (task 3) wasn't built.
