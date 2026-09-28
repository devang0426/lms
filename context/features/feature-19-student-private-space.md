# Feature 19: Student private space

**Status:** Not started
**Depends on:** 14, 15, 16, 17, 18
**Demo step:** 8

## Goal

The original NitroAI experience inside Studyhall. A student uploads their
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

- [ ] The demo student uploads a PDF and gets notes, cards, a quiz, a chat
      with citations, and an on-demand podcast.
- [ ] The demo admin cannot open the student's `/space/[noteId]`: it
      returns a 404.
- [ ] Chat with "Include my courses" on can cite both the upload and a
      lecture timestamp.
- [ ] `npm run build` passes.
