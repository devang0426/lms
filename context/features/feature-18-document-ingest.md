# Feature 18: Document ingest

**Status:** Not started
**Depends on:** 12, 13
**Demo step:** 3, 8

## Goal

Instructors attach PDF, DOCX, web page or audio sources to lessons (as a
reading lesson or as resources). They go through the same draft pipeline
and are cited by page or section.

## Scope

**In:**
- `ingest-document` task for PDF, DOCX, URL, audio and best-effort YouTube.
- Lesson resources.
- Page citations.
- The SSRF guard.

**Out:** student private uploads (19), which reuse this task.

## Schema

`documents`: id, lessonId (nullable), ownerId (nullable), kind, filename,
blobUrl, pathname, url, pageCount, text, status, error.

## Files

- `trigger/ingest-document.ts`:
  - **pdf:** `unpdf`, per page. Chunks carry `page`.
  - **docx:** `mammoth`, with headings kept as sections.
  - **url:** fetched on the server through `lib/net/safe-fetch.ts`.
  - **audio:** the same transcribe step as video. Chunks carry `startSec`.
  - **youtube:** yt-dlp captions or audio. On a bot block, it fails with a
    clear message: "YouTube blocked this server — upload the video file
    instead."
  - Then notes, cards and quiz (the feature 12 tasks, in document mode) and
    `index-lesson`.
- `lib/net/safe-fetch.ts`, the SSRF guard:
  - http/https only.
  - Resolve DNS and reject private, loopback and link-local addresses.
  - No redirects to those addresses.
  - 10 MB and 15 second limits.
  - HTML only.
  - Readability extraction (`@mozilla/readability` with `linkedom`).
- Lesson player "Resources" tab: attached documents with downloads.
- Citation chips for documents: "Week 2 slides · p. 7" opens the PDF at
  `#page=7` in a new tab.

## Acceptance criteria

- [ ] A 30-page PDF becomes draft notes, cards and quiz. An assistant
      answer about it cites the correct page.
- [ ] `http://169.254.169.254/`, `http://localhost` and private IPs are
      refused by `safe-fetch` (unit tested).
- [ ] A YouTube failure shows the friendly message, not a stack trace.
- [ ] `npm run build` passes.
