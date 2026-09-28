# Feature 20: Assignments and grading

**Status:** Not started
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

- [ ] The student submits text and a file. After the due date, the
      submission is flagged late.
- [ ] The admin grades it from the queue. The student sees the score and
      feedback, and a notification once feature 21 exists.
- [ ] The CSV export opens correctly in Excel or Sheets.
- [ ] A student can't read other students' submissions (404).
- [ ] `npm run build` passes.
