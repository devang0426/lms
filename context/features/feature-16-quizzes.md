# Feature 16: Quizzes and mastery

**Status:** Not started
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

- [ ] The demo student takes a practice quiz and sees mastery by topic.
- [ ] A graded quiz respects the due date and the attempt limit. The score
      is saved.
- [ ] The correct answers for a graded quiz aren't in the page payload
      before submission.
- [ ] `npm run build` passes.
