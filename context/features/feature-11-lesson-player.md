# Feature 11: Lesson player

**Status:** Done (browser checks pending; see progress-tracker.md)
**Depends on:** 10
**Demo step:** 5

## Goal

The Lesson player (wireframe 05) for video lessons:

- Video.
- Transcript that follows playback.
- Chapters, once feature 12 exists.
- Deep links.
- Watch progress.
- Timestamped personal notes.

## Scope

**In:** `/courses/[courseId]/lessons/[lessonId]`, the player component,
progress tracking, personal notes, and Previous/Next.

**Out:**
- The assistant panel (14).
- Resources and discussion tabs (18 and 21). Show empty states until then.

## Schema

- `watch_progress`: userId, lessonId, positionSec, watchedRanges (jsonb),
  completedAt, updatedAt. Primary key (userId, lessonId).
- `lesson_notes`: id, userId, lessonId, atSec, text, createdAt.

## Files

- `app/(student)/courses/[courseId]/lessons/[lessonId]/page.tsx`:
  - A server component that runs `getLessonForUser`, which does the
    enrollment check.
  - It loads the video URLs, segments, chapters, the student's progress and
    notes, and the course contents for the sidebar.
- `components/player/video-player.tsx`, a client component:
  - A native `<video>` with poster, `<track kind="captions">`, and custom
    controls in the design's mono style (time, scrubber in butter fill,
    speed, CC).
  - It exposes `seek(sec)` through context.
  - It reads `?t=` once on load.
- `components/player/transcript-panel.tsx`:
  - Segments, with the active one highlighted from `timeupdate`
    (throttled).
  - Clicking a segment seeks.
  - It auto-scrolls unless the user has scrolled.
- `components/player/chapter-list.tsx`: chapters with times. Clicking one
  seeks. Markers on the scrubber.
- `components/player/notes-tab.tsx`: "Write a note at 04:12…". It saves
  with the current `atSec`. Clicking a note seeks there.
- Course contents sidebar: modules and lessons with step indicators, and
  the current lesson highlighted.
- Progress:
  - Send `positionSec` and `watchedRanges` to a server action at most once
    every 15 seconds, and on `pagehide`.
  - A lesson auto-completes at 90% watched. "Mark complete" also completes
    it.

## Implementation notes

- `lib/time.ts`: `formatTime(sec)` gives `mm:ss` or `h:mm:ss`, and
  `parseT("12m48s" | "768")`. Pure and tested.
- If the page loads with `?t=`, it starts there. Without it, it resumes
  from `watch_progress.positionSec`, unless that is within 10 seconds of
  the end.
- Students see only published lessons. Staff use the same player in
  preview mode, from the builder.

## Acceptance criteria

- [ ] `/…/lessons/[id]?t=768` opens the lesson and plays from 12:48.
- [ ] Clicking any transcript line jumps the video there within 1 second.
      The highlight follows playback.
- [ ] A note taken at 04:12 shows "04:12". Clicking it seeks to 04:12.
- [ ] Reloading mid-lecture resumes at the last saved position. Watching
      to 90% marks the lesson complete, and home progress updates.
- [x] An unenrolled user gets a 404, and no video URL appears in the HTML.
- [x] `npm run build` passes.
