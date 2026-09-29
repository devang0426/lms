# Feature 17: Podcast

**Status:** Done (2026-09-28); the Trigger.dev run and the browser clicks are still to check
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

- [x] Clicking Generate produces a playable MP3 with two distinct voices.
      Every later visitor gets the cached file. (Verified by running the
      task body against the real services; the click through the
      Trigger.dev worker is still to check.)
- [x] Cost is logged under `podcast` in `ai_usage`.
- [x] `npm run build` passes.

## Implementation notes (as built)

- **Schema (migration 0011):** `podcasts` as above, plus `audioPathname`,
  `error`, `sourceHash` and `requestedBy`. Unique on (lessonId, length)
  and on (noteId, length). `sourceHash` and `promptsVersion` describe the
  audio that is stored and change only when new audio is saved, so a
  failed remake keeps the old episode playable. `status` is the latest
  generation's state (`generating | ready | failed`).
- **Source:** the lesson's *published* notes, as Markdown, capped at 8k
  tokens. The cache key is the SHA-256 of that text plus
  `PROMPTS_VERSION`.
- **Who can start it (`lib/study/podcast.ts`):**
  - No episode yet, or every attempt failed: staff, or the first student
    to ask.
  - Notes or prompts changed since: staff only ("Remake podcast"), so
    students can't keep spending on remakes. Students keep hearing the old
    episode.
  - Up to date, or being made: nobody.
  - The claim is one conditional upsert, so two clicks at once start one
    run.
- **Task:**
  - Script: strong tier, zod-validated, one retry. It needs at least 6
    lines and both speakers.
  - TTS: 4 lines at a time. Host `am_michael`, guest `af_heart`.
  - Join: ffmpeg concat demuxer with a 0.35 s pause between lines. It
    re-encodes once to 64 kbps mono MP3, so the file has one correct header
    even if Kokoro's two OpenRouter providers differ.
  - Nothing is written until the episode is complete. No retries (like
    lesson drafting). Queue `podcast`, 2 at a time.
- **Job visibility:** a podcast job can be watched by anyone who can open
  the lesson. A run that died before its task started is marked failed
  when the tab next loads.
- **Staff preview:** the tab always shows, and says to publish the notes
  first. Students see it once notes are published or an episode exists.
- **Demo reset:** deletes podcasts the demo student generated, and their
  MP3s, so the demo's Generate step starts fresh.
- **Measured** on the seeded lecture: 12 lines, 2:41, made in 31 s, cost
  $0.0069. The free models' answers didn't work out, so gemini-2.5-flash
  wrote the script. The voices' median pitch is ~119 Hz (host) and ~185 Hz (guest).

## Addition: a Hinglish episode (2026-09-29)

- **Why:** asked for by the product owner. Every lesson (and private
  note) can have an English episode and a Hindi-English ("Hinglish")
  episode. The Podcast tab switches between them.
- **Schema (migration 0015):**
  - `podcasts.language` (`en` | `hinglish`, default `en`).
  - The unique keys are now (lesson, length, language) and (note, length,
    language). Existing episodes became English.
- **Script:**
  - `podcastSystem(length, "hinglish")` asks for Hindi in Devanagari, with
    technical and common English words in Latin letters.
  - It's a new prompt: the English prompt is unchanged, and so is
    `PROMPTS_VERSION`.
  - At least 60% of lines must contain Devanagari, otherwise the script is
    retried once. A romanized script ("aaj hum…") is garbled by the Hindi
    voices.
- **Voices:** Kokoro's `hm_omega` (host) and `hf_alpha` (guest).
- **Why this script mix:** tested before building by transcribing
  Kokoro's output back with Whisper.
  - Devanagari with English terms was heard back almost word for word.
  - Romanized Hinglish came back as garbled Urdu.
  - A few English words sound accented ("nullity" was heard as "नलती").
- **Files:** Hinglish MP3s get a `-hinglish` suffix. English keeps its
  names.
- **Rules:** caching, who can generate, the AI cost feature
  (`podcast` / `space-podcast`) and the demo reset are the same per
  language.
- **Measured** on "Linear combinations and span":
  - 13 lines, 3:10, made in 121 s, cost $0.0073 (the script by
    gemini-2.5-flash after the free model).
  - Whisper transcribed the first minute back almost word for word.
  - The episode was requested as the admin, so `demo:reset` keeps it.
