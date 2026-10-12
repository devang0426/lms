# Feature 36: Course notes download

**Status:** Done (2026-10-12). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 12 (AI lesson content), 19 (note export), 29 (page batches)
**Demo step:** —
**Source:** the owner, 2026-10-12: "a button that allows the user to
download the content of lectures 1, 2 and 3 collectively, locally on the
device". The owner chose the published study notes, all three formats and
a lesson picker.

## Goal

A student keeps a course's study notes as one file on their device:
the lessons they pick, in course order, each under its own heading.

## Scope

**In:**
- "Download notes" on the course page's Curriculum tab, shown when at
  least one lesson has published notes. It reads "Notes for N lessons".
- A dialog that lists those lessons by module ("Lesson 3 · Title", the
  course page's numbering), all ticked, with Select all / Clear all, and
  a format:
  - **PDF**: a print page in a new tab that opens the print dialog
    (Save as PDF).
  - **Word**: a `.doc` (Word-compatible HTML), as feature 19's export.
  - **Markdown**: a `.md`.
- The file: the course's title, code and lesson count, a contents list,
  then each lesson's notes under "Lesson N · Title" and its module. In
  Word and print each lesson starts a new page. A note's own top-level
  headings move one level down, under the lesson's title.
- `GET /courses/[courseId]/notes/export?format=md|doc|print&lessons=…`
  builds it on the server. `lessons` (up to 300 ids) is optional: every
  lesson with notes when left out.

**Who and what:** enrolled students and the course's staff, through the
same access check as the course page; anyone else gets a 404. Everyone,
staff included, gets **published notes of published lessons only**: the
download is what students study from, never an unreviewed draft.

**Out:**
- Transcripts, chapters, a student's own timestamped notes, flashcards
  and quizzes.
- A server-made PDF (the browser's print dialog makes it), and ZIPs.
- Private-space notes (feature 19 already exports each one).

## Acceptance criteria

- [x] The course page shows "Download notes" when a lesson has published
  notes, at no extra round trip (one more statement in its batch).
- [x] Markdown and Word download as `<code>-notes.md` / `.doc`, with the
  picked lessons in course order; PDF opens the print page.
- [x] Unticked lessons, lessons without published notes and ids from
  another course are left out.
- [x] A bad format or lesson id is a 400; a course the viewer can't see
  is a 404; signed out goes to sign-in.
- [x] axe finds nothing in the dialog at desktop and phone widths.
- [x] `npm run build`, lint and tests pass.
