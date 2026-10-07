# Feature 19: Student private space

**Status:** Done (2026-09-29); the Trigger.dev run and the browser clicks are still to check
**Depends on:** 14, 15, 16, 17, 18
**Demo step:** 8

## Goal

A dedicated private study space inside Studyhall. A student uploads their
own material and gets private notes, flashcards, quiz, chat and podcast.
It is visible only to them.

## Scope

**In:**
- `/space` dashboard (a list of the student's notes).
- Create from file, link or audio.
- The note view with tabs: Notes, Flashcards, Quiz, Chat, Podcast.
- Private chat that also searches the student's enrolled courses, if they
  turn that on.

**Out:** quotas and credits (out of scope for v1). Sharing notes.

## Files

- `app/(student)/space/`:
  - `page.tsx`: the student's notes as cards, plus a "New note" dialog
    with File (PDF/DOCX/audio), Link and YouTube options.
  - `[noteId]/page.tsx`: tabs reusing the feature 12/15/16/17/14
    components with `ownerId` scope.
- Uploads go through Blob, with the path `private/{userId}/…`. The upload
  token rule: the owner must be the current user.
- `ingest-document` runs with `ownerId` set and without course scope. Its
  outputs are published straight away, since there is no review step for
  a student's own notes.
- Chat scope:
  - `{ownerId: userId}` by default.
  - With the "Include my courses" toggle on, the chunks also come from
    their enrolled courses.
  - The refusal rule still applies: it is limited to their own material
    and courses.
- Markdown, Word and print export from `lib/export.ts`.

## Implementation notes

- Instructors and admins **cannot** read private notes. Every query filters
  on `ownerId = currentUser`, with no staff override.
- Use a per-user Trigger.dev `concurrencyKey`, so one student can't block
  the queue.

## Acceptance criteria

- [x] The demo student uploads a PDF and gets notes, cards, a quiz, a chat
      with citations, and an on-demand podcast. (Verified by running the
      task's code against the real services; the path through the
      Trigger.dev worker is still to check.)
- [x] The demo admin cannot open the student's `/space/[noteId]`: it
      returns a 404. (Verified over HTTP on the production build.)
- [x] Chat with "Include my courses" on can cite both the upload and a
      lecture timestamp.
- [x] `npm run build` passes.

## Implementation notes (as built)

- **Routes:** `/space` and `/space/[noteId]` live in the `(sidebar)` shell
  (the spec's `app/(student)/space/`), so the student keeps the nav while
  studying a note. The chat streams from `POST /api/space/chat`.
- **Schema (migration 0014):**
  - `documents.note_id`: a private upload's note (one per note).
  - `chat_threads.note_id` (with `course_id` now nullable) and
    `quiz_attempts.note_id` (with `lesson_id` now nullable).
  - CHECKs that each row is either a course's or a note's, and that
    `notes` and `documents` have exactly one of lesson and owner.
- **Owner only, no override:** every read of a private note goes through
  `lib/db/space.ts`, `lib/db/study.ts`, `lib/db/quizzes.ts` or
  `lib/db/podcasts.ts` with the owner in the SQL. Anyone else, admins
  included, gets a 404 page or "not found". The same goes for the file
  route (`/documents/[id]`), the search (private chunks match only their
  owner) and the jobs (`getJobForViewer`). Audit rows about private notes
  carry ids only, and a private upload's `blob.upload` row has no URL:
  admins read the audit log, and the public Blob URL would open the file.
- **Create:**
  - File (PDF, DOCX, audio; 200 MB like lesson documents): the note and its
    document are made first, then the browser uploads to
    `private/{userId}/`. The token is issued only when the document is the
    uploader's own (`private-document` kind, `deps.ownsDocument`). An
    upload that fails removes its empty note.
  - Link or YouTube: checked like the lesson editor's links, then fetched
    by the task through the SSRF guard.
  - Rate limit: 10 new notes per student per hour, counted from the audit
    log, so deleting a note doesn't give its slot back.
- **The task:** `ingest-document` reads the source as in feature 18. For a
  document with an owner it then runs `generate-notes`, `-cards` and
  `-quiz` with `{ noteId }` (document mode, saved published) and the new
  `index-note`. The run and each child run carry the owner as their
  Trigger.dev `concurrencyKey` (per-user copies of the `document-ingest`,
  `lesson-ai` and `note-index` queues), as does a note's podcast. Each
  step skips what's saved, so "Try again" resumes. The AI cost is logged
  to the student under `space-notes`, `-cards`, `-quiz`, `-index`,
  `-chat` and `-podcast` (plus `transcribe` and `retrieval`).
- **Chat scope:** `{ownerId}` searches all of the student's uploads, not
  only this note. "Include my courses" is per question and adds the
  courses they're enrolled in or teach, still through the access filter.
  The two are searched separately and their rankings fused (RRF), so the
  course's many lecture passages can't crowd the student's pages out of
  the top 8 (they did in the first test).
  Lecture chips carry their course ("MATH 201 · Lecture 3 · 12:48") and
  open the lesson at `?t=`. The refusal is fixed copy, with no "Ask your
  instructor".
- **Reused components:** `StudyNotes`, `FlashcardDeck`, `QuizTab` (practice
  and mastery; no graded quizzes on a note), `PodcastTab` (the owner can
  remake a stale episode, like staff) and the assistant's answer body,
  chips and stream reader in a new `SpaceChat`.
- **Export:** Markdown, Word (.doc) and print from `lib/export.ts`, in the
  browser.
- **Delete** (not in the spec's list, but a note list needs it): the note
  and everything made from it go (cascade), active runs are cancelled, and
  its files leave Blob.
- **Demo reset:** a "Private space" step deletes the demo student's notes
  and their files.
- Private cards stay out of `/study` and the sidebar's due count, which
  are about courses.
