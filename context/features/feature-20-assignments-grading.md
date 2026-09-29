# Feature 20: Assignments and grading

**Status:** Done (2026-09-29)
**Depends on:** 07, 09
**Demo step:** 9

## Goal

Instructors set assignments. Students submit files or text. Instructors
grade from a queue with feedback. There is a gradebook for both roles.

## Scope

**In:**
- Assignment lessons.
- Submissions.
- The grading queue.
- Rubric-free points plus feedback.
- The gradebook with a CSV export.
- A seeded submission.

**Out:**
- Rubrics.
- Plagiarism checks.
- AI auto-grading.

## Schema

- `assignments`: id, lessonId, instructions (Markdown), dueAt, points,
  allowLate, category (`homework | project | quiz | exam`).
- `submissions`: id, assignmentId, userId, text, files (jsonb blob refs),
  submittedAt, late (bool), status (`submitted | graded | returned`).
- `grades`: id, submissionId or gradedQuizAttemptId, userId, score,
  maxScore, feedback (Markdown), gradedBy, gradedAt.
- `grade_categories`: courseId, category, weight. The scheme is still an
  open question, so the default is equal weights, shown as percentages.

## Files

- Student:
  - The assignment page shows the instructions and due date (butter badge
    when it is due soon).
  - A submit form with text and file upload (Blob,
    `submissions/{assignmentId}/{userId}/…`).
  - After grading, the page shows the grade and feedback.
- Instructor:
  - `/instructor/grading`: the queue (the wireframe's "Needs grading"
    list), oldest first.
  - The grade view: submission on the left, score and feedback on the
    right, "Save and next".
- Gradebook:
  - `/instructor/courses/[id]/gradebook`: a table of students × items, with
    CSV export.
  - `/grades` for students: their own grades per course.
- Seed: `seedAssignment()`. One assignment in the demo course, with a
  submission from the demo student ready to grade (demo step 9).

## Acceptance criteria

- [x] The student submits text and a file. After the due date, the
      submission is flagged late. (Checked against the real database and
      Blob; the form itself not yet clicked in a browser.)
- [x] The admin grades it from the queue. The student sees the score and
      feedback, and a notification once feature 21 exists. (Feature 21
      added it: returning a grade notifies the student in the same batch.)
- [ ] The CSV export opens correctly in Excel or Sheets. The format is
      built and tested for it (UTF-8 BOM, CRLF, RFC 4180 quoting, formula
      guard); it hasn't been opened in Excel or Sheets yet.
- [x] A student can't read other students' submissions (404). (Checked
      over HTTP with a real session: another student's file is a 404.)
- [x] `npm run build` passes.

## Implementation notes (as built)

- **Statuses.** `submitted` = in the queue. `graded` = a draft grade that
  only staff see; it stays in the queue. `returned` = the student sees the
  score and feedback; it leaves the queue (feature 21's "grade returned"
  notification goes here). The grade view's **Save and next** returns the
  grade and opens the oldest remaining submission; **Save draft** keeps it
  as `graded`. A returned grade can be corrected ("Update grade") but not
  taken back.
- **Handing in.** One submission per (assignment, student). The student
  can replace it until it has any grade, draft or returned. After the due
  date it's accepted only when the assignment allows late work, and
  flagged `late` by the database clock; otherwise the assignment is
  closed. All of that is one `insert … select … on conflict` statement,
  with its audit row in the same batch.
- **Files.** Upload kind `submission-file`: PDF, DOCX, PNG, JPEG or text,
  25 MB each, 5 per submission, straight from the browser to
  `submissions/{assignmentId}/{userId}/`. The token is issued only to a
  student who can see the lesson while the assignment takes work. On hand
  in each file ref is checked against Blob (it must exist, sit in that
  student's folder, and have an allowed type and size; size and type are
  taken from Blob). A resubmission keeps files by position, so the page
  never holds a file URL; dropped files are deleted. Files open through
  `/submissions/[id]/files/[n]`, which redirects only the owner and the
  course's staff (everyone else: 404).
- **Assignment title** is the lesson's title; there's no separate field.
  The assignment row is created when the instructor first saves the
  lesson editor's "Assignment" card. Until then students see "No
  instructions yet".
- **Gradebook.** Items: the course's assignments and graded quizzes, in
  curriculum order. A quiz's grade is its best submitted attempt × points,
  read from `quiz_attempts` (no `grades` row is written for quizzes;
  `gradedQuizAttemptId` is kept for a future instructor override). Totals
  count what students can see (returned grades and quizzes): each
  category is points earned ÷ points possible, and the total averages the
  categories that have graded work by weight. Weights come from
  `grade_categories`, default 1 each (equal; there's no editor yet — the
  scheme is an open question). Cells: score (with "Late"), "Draft",
  "To grade", "Missing" (past due, nothing handed in) or "—".
- **CSV** at `/instructor/courses/[id]/gradebook/export` (no `.csv` in the
  path: `proxy.ts` skips paths that look like static files, which would
  skip Clerk). Row 2 holds the points possible; cells hold counted scores
  only; then "Total %".
- **Keeping grades.** Submissions and grades are never deleted by the app.
  The builder refuses to delete a lesson or module with student work (a
  submission or a submitted graded-quiz attempt), and the
  `submissions → assignments` foreign key refuses too. `demo:reset`
  deletes the demo student's work, then restores the seeded submission.
- **Seed.** `seedAssignment()` adds "Problem set 1: span and independence"
  (homework, 10 points, late work allowed, due a week out; a re-seed moves
  a due date less than two days away) to "Vectors and spaces", with the
  Demo Student's text answer handed in (`scripts/lib/demo-assignment.ts`).
- Due soon = within three days (Butter badge). Due dates render in the
  reader's time zone (`LocalDate`; the server renders UTC first).
