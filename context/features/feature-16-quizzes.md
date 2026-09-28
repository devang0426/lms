# Feature 16: Quizzes and mastery

**Status:** Done (2026-09-28)
**Depends on:** 12
**Demo step:** 7

## Goal

Practice quizzes at three difficulty levels, with mastery per topic. Graded
quizzes that the instructor sets and that count toward grades.

## Scope

**In:**
- Taking quizzes (MCQ, true/false, fill-in-the-blank).
- Attempts.
- Mastery.
- Graded quiz settings (due date, attempts, points).

**Out:** the gradebook display (20).

## Schema

- `quiz_attempts`: id, userId, lessonId, mode (`practice | graded`),
  startedAt, submittedAt, score.
- `quiz_answers`: attemptId, questionId, answer, correct.
- `graded_quizzes`: id, lessonId, title, questionIds (uuid[]), dueAt,
  maxAttempts, points.

## Files

- `components/study/quiz-runner.tsx`:
  - One question at a time.
  - Difficulty picker (basic, intermediate, exam) in practice mode.
  - Immediate feedback with the explanation in practice mode. Feedback
    only after submitting in graded mode.
  - Fill-in-the-blank uses a normalized comparison (case, whitespace,
    simple number formats).
- Mastery view: `masteryByTopic`, shown with sage, butter and clay bars. A
  "Review in video" link for weak topics.
- Instructor: in the builder, "Create graded quiz from bank". Pick the
  questions and set the due date and points.
- Graded answers are checked **on the server**. The correct answers never
  reach the client before the student submits.

## Acceptance criteria

- [x] The demo student takes a practice quiz and sees mastery by topic.
- [x] A graded quiz respects the due date and the attempt limit. The score
      is saved.
- [x] The correct answers for a graded quiz aren't in the page payload
      before submission.
- [x] `npm run build` passes.

## Implementation notes (as built)

- `quiz_attempts` has `gradedQuizId` too (not in the schema above): the
  attempt limit counts per quiz, and a lesson can have several. `score` is
  the fraction correct (0–1); the gradebook multiplies by `points`.
- **Keeping graded answers secret:** picking questions for a graded quiz
  moves them to the `graded` bank, and practice only serves the `practice`
  bank. Starting an attempt returns questions without `correctIndex` or
  explanations, and a fill-in-the-blank without its options (its only
  option is the answer). Nothing about the questions is in the page
  payload; they load when an attempt starts.
- Practice gives instant feedback in the browser (practice answers are in
  its payload), and the finished set is saved in one call and re-scored on
  the server, so mastery can't be forged.
- Attempt rules: a new attempt is inserted by one statement that checks
  the due date and the limit. An unsubmitted attempt counts and is
  resumed with "Continue" (its answers aren't kept until submit). An
  attempt started before the due date can be submitted after it.
  Unanswered questions count as wrong.
- Regenerating a quiz level on the review screen now replaces only the
  practice bank, so graded questions and students' answers survive.
- The create form is on the lesson editor ("Create graded quiz from
  bank"), at `…/lessons/[lessonId]/graded-quizzes/new`. Editing and
  deleting graded quizzes are not built yet.
