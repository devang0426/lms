# Feature 18: Document ingest

**Status:** Done (2026-09-29); the Trigger.dev run and the browser clicks are still to check
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

- [x] A 30-page PDF becomes draft notes, cards and quiz. An assistant
      answer about it cites the correct page. (Verified by running the
      task's code against the real services; the path through the
      Trigger.dev worker is still to check.)
- [x] `http://169.254.169.254/`, `http://localhost` and private IPs are
      refused by `safe-fetch` (unit tested).
- [x] A YouTube failure shows the friendly message, not a stack trace.
- [x] `npm run build` passes.

## Implementation notes (as built)

- **Schema (migration 0012):**
  - `documents` as above, plus `title`, `contentType`, `sizeBytes`,
    `durationSec`, `createdBy` and `parts` (jsonb).
  - `parts` holds the citable pieces: `{ text, page? , section?,
    startSec?, endSec? }`.
  - `content_chunks` gained `document_id` (cascade) and `section`.
- **Two roles for a document:**
  - On a *reading* lesson with no video, the documents are the lesson's
    source. Notes, cards and quiz are drafted from all of them (document
    mode), and redrafted whenever one is added.
  - On any other lesson a document is a resource: listed under Resources,
    indexed and cited, but not drafted from. The video's notes stay tied
    to its timeline.
- **Document mode:**
  - Notes come from NitroAI's ported `generateNoteBody`: map over ~6k-token
    pieces, then merge.
  - Cards and quiz reuse the lecture generators, with the notes' `##`
    sections standing in for chapters.
  - There are no chapters, and every `startSec` is null. The review screen
    hides its Chapters tab.
- **Extraction (`trigger/lib/ingest-document.ts`):**
  - PDF: per page.
  - DOCX: per Word heading (mammoth → HTML → `htmlToSections`).
  - Web page: `safe-fetch` → Readability (linkedom) → per heading.
  - Recording: the same Whisper helper as video, now in
    `trigger/lib/transcribe.ts`.
  - YouTube: yt-dlp captions, else its audio through Whisper. Only a
    watch URL rebuilt from the video id reaches yt-dlp.
  - A PDF with almost no text (a scan) fails with an OCR hint.
- **Chunks (`chunk-document.ts`):**
  - Never cross a page or section. ~1,200 characters with ~150 overlap.
  - Headed "Title · p. 7". A recording is chunked like a transcript.
- **Citations:**
  - Labels read "Week 2 slides · p. 7", "Reading · Eigenvalues" or
    "Office hours · 04:10".
  - A document chip opens `/documents/[id]#page=7` (or `#t=`) in a new
    tab. That route checks access, then redirects to the file, and the
    browser keeps the fragment.
  - The file URL is never in a page. Document chips never seek the video,
    and are never placed on the lesson's transcript.
- **SSRF guard (`lib/net/`):**
  - Addresses are checked inside the socket's own DNS lookup, so DNS
    rebinding can't slip a private address in after the check.
  - Literal IPs and `localhost` / `.internal` names are refused up front.
  - Redirects are followed by hand, and each hop is checked again.
  - The 10 MB cap counts decompressed bytes. Only HTML is accepted, within
    15 s.
- **Uploads:** a new `lesson-document` kind (PDF, DOCX, audio; 200 MB,
  multipart) in `docs/{lessonId}/`. Links are saved and fetched by the task.
- **Indexing:** `index-lesson` now indexes the transcript and every ready
  document together. The builder's publish toggle also indexes a lesson
  that has documents but no video.
- **Removing a document** deletes its file and passages and re-indexes a
  published lesson. Drafts made from it stay until regenerated.
- Not in the demo reset: documents are instructor content, not student
  activity. Feature 19's private uploads will need a reset step.
