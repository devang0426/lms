# Feature 10: Video upload and processing

**Status:** Done (2026-09-28). Browser upload check pending, see below.
**Depends on:** 09
**Demo step:** 2

## Goal

An instructor uploads an MP4 to a video lesson. The system turns it into a
playable video with a poster, captions and timestamped transcript segments.

## Scope

**In:** pipeline steps 1–7 from `architecture.md` (upload, probe,
faststart, poster, audio, transcribe, VTT).

**Out:** chapters, notes, cards and quiz (12), and indexing (13).

## Schema

- `videos`: id, lessonId, blobUrl, pathname, posterUrl, vttUrl,
  durationSec, width, height, codec, sizeBytes, status
  (`uploading | processing | ready | rejected | failed`), error.
- `transcript_segments`: id, lessonId, idx, startSec, endSec, text. Index
  on (lessonId, startSec).

## Files

- The lesson editor (in the feature 07 builder) gets an "Upload video"
  panel:
  - Drop zone for `.mp4`.
  - Blob `upload()` with `multipart: true` and upload progress.
  - After the upload, `JobProgress` for the processing run.
- `trigger/video-process.ts`: the parent task. It runs these subtasks with
  `triggerAndWait`:
  - `video-probe`: `ffprobe`. Reject anything other than H.264/AAC in MP4,
    or over the size or duration limits (configurable; default 60 min).
  - `video-faststart`: `ffmpeg -c copy -movflags +faststart`, only when
    needed. Then `put` it back with `allowOverwrite`.
  - `video-poster`: a frame at 10% of the duration, saved as `poster.jpg`.
  - `transcribe-lesson`:
    - Extract 16 kHz mono audio.
    - Split it into pieces under the Whisper upload limit.
    - Run `engine.transcribe` on each piece.
    - Shift each segment by its piece's offset.
    - Bulk-insert the `transcript_segments`.
    - Write `captions.vtt`.
- `lib/video/vtt.ts`: turns segments into WebVTT. Pure and tested.
- When it finishes, set `videos.status='ready'`, `lessons.status='ready'`
  and `lessons.durationSec`.

## Implementation notes

- **From feature 05:**
  - Pre-chunk audio with ffmpeg before calling `engine.transcribe()`. Its
    built-in chunker uses WebAudio, which doesn't exist on the server.
  - Delete `lib/ai/legacy/` once these tasks replace `pipeline.ts`.

- Downloads to the task's temp directory. Stream them; don't buffer whole
  videos in memory.
- Every subtask is idempotent. If its output already exists (the segments
  for this lesson, the poster pathname), it skips.
- The rejection message is for humans: "This video uses HEVC. Please export
  as MP4 (H.264) — in most editors that's the default 'MP4' preset."
- Log the Whisper cost through `withUsage("transcribe", …)`.

## Acceptance criteria

- [x] Uploading a 20-minute H.264 MP4 ends with `ready`. The poster and VTT
      exist in Blob, and the segments cover the whole duration with no
      gaps longer than 10 seconds. (Verified on the dev worker: 254
      segments, 0.18 s → 20:00, largest gap 0.87 s, continuous across the
      10:00 piece boundary.)
- [x] A HEVC or `.mov` file is rejected with the friendly message.
      (Both verified; the browser also stops a `.mov` before upload.)
- [ ] Closing the browser mid-process doesn't stop the job. Reopening the
      lesson editor shows live progress.
- [x] Re-running the task on a finished lesson does no duplicate work.
      (Returns `skipped` in 2.8 s, with no new segments, blobs or Whisper
      charges. A retry after a failure skipped probe, faststart and poster.)
- [x] `npm run build` passes.

## As built

- **Schema** (migration 0004): `videos` (adds `faststart`, `created_by`)
  and `transcript_segments`, which also carries `video_id`. A replacement
  upload is its own row; when it's ready the older rows, segments and
  blobs are deleted. A published lesson keeps playing its current video
  until then.
- **Upload:** lesson editor at `/instructor/courses/[courseId]/lessons/[lessonId]`
  (linked from each builder row: "Upload video" / "Open"). The
  `prepareVideoUpload` action checks staff, kind, type and size and
  creates the row. The browser uploads to Blob (multipart);
  `recordUpload` → `startVideoProcessing` (idempotent) starts the run
  with key `lesson:{lessonId}:video:{videoId}:process`. That key is per
  video, not per lesson, so a re-upload isn't deduped into the old run.
- **Tasks:** `video-process` (parent, retries 1) →
  `video-probe` → `video-faststart` → `video-poster` → `transcribe-lesson`
  (each retries on its own and skips finished work). ffprobe, the poster
  and audio extraction read the Blob URL directly (range requests); only
  the faststart remux downloads, streamed to a temp dir. Rejections use
  `AbortTaskRunError` (no retries), keep the message and delete the
  unusable file.
- **Transcription:** ffmpeg cuts 16 kHz mono 32 kbps MP3 pieces of 10
  minutes (~2.4 MB). Pieces under 1 s are skipped: Whisper returns 400 on
  the sliver the segmenter leaves at the end. Offsets use each piece's
  real duration, and segment ends are clamped to the video length. All
  segments go in one `db.batch` (atomic). Cost is logged with
  `withUsage("transcribe")`; OpenRouter reports it (about $0.002 per
  10 minutes).
- **Pure helpers with tests:** `lib/video/vtt.ts`, `probe.ts` (limits via
  `VIDEO_MAX_MINUTES`, default 60) and `mp4-atoms.ts`.
- The engine names pass-through audio by its MIME type (it was always
  `audio.webm`). `lib/ai/legacy/` is deleted.
- Unpublishing a lesson with a ready video now returns it to `ready`, not
  `draft`.
- **Local dev:** `ffmpeg-static` / `ffprobe-static` dev dependencies;
  `FFMPEG_PATH` / `FFPROBE_PATH` in `.env.local` (see `example.env`).
  Deployed tasks get ffmpeg from the build extension.
- The demo course's draft lesson "Eigenvectors, visually" keeps the
  processed 20-minute test video (a looped TTS narration over a plain
  frame) for building the player in feature 11. Replace it with the real
  demo lecture (feature 12).

**Still to check in a browser:** as the demo admin, drop an MP4 on a video
lesson, watch the progress, close the tab mid-process and reopen the
lesson editor (the pipeline itself was verified without a browser).
