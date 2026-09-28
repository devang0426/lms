# Feature 17: Podcast

**Status:** Not started
**Depends on:** 12
**Demo step:** 7

## Goal

A two-voice audio conversation about a lesson, generated **only on
demand**, then cached and shared by everyone in the course.

## Scope

**In:** the script and TTS task, storage, and the player UI in the lesson.

**Out:** podcasts for private notes (19), which reuse this.

## Schema

`podcasts`: id, lessonId/noteId, length (`short | medium | long`), script
(jsonb), audioUrl, durationSec, status, promptsVersion, createdAt.

## Files

- `trigger/generate-podcast.ts`:
  1. `generatePodcastScript`, from `lib/ai/generation`.
  2. TTS each line with the host and guest voices (Kokoro through
     OpenRouter).
  3. Join the pieces with ffmpeg (the concat demuxer), not by gluing raw
     Blobs together.
  4. `put` to `podcasts/{lessonId}/{length}.mp3`.
- A "Podcast" tab in the lesson player:
  - If none exists: a "Generate podcast (short)" button with `JobProgress`.
    Only staff, or the first student to ask, can start it.
  - If one exists: an audio player, plus the script as a readable
    transcript with host and guest labels.
- Cache it. Never regenerate while the lesson content and
  `PROMPTS_VERSION` are unchanged.

## Acceptance criteria

- [ ] Clicking Generate produces a playable MP3 with two distinct voices.
      Every later visitor gets the cached file.
- [ ] Cost is logged under `podcast` in `ai_usage`.
- [ ] `npm run build` passes.
