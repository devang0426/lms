# Feature 15: Flashcards

**Status:** Not started
**Depends on:** 12
**Demo step:** 7

## Goal

Students review published lesson flashcards with the NitroAI FSRS
scheduler. Each student has their own schedule, and there is a "due today"
queue across courses.

## Scope

**In:**
- Per-student review state.
- The review UI in the lesson and at `/study`.
- The "Due today" count on home.

**Out:** private-space cards (19), which reuse this.

## Schema

`card_reviews`: userId, cardId, due, stability, difficulty, reps, lapses,
lastReview, state. Primary key (userId, cardId).

## Files

- `lib/db/study.ts`:
  - `dueCards(userId, {courseId?, lessonId?}, limit)`. Cards the student
    has never reviewed count as new and due now.
  - `recordReview(userId, cardId, rating)` uses `lib/study/fsrs.ts`.
- `components/study/flashcard-deck.tsx`:
  - Flip the card (Space).
  - Rate it Again, Hard, Good or Easy (keys 1–4). Each button shows its
    next interval.
  - Progress through the session.
  - "Review in video" when the card has `startSec`.
  - An end-of-session summary.
- A "Flashcards" tab in the lesson player.
- `/study`: all due cards across enrolled courses, with filters by course.
- Student home: a "N cards due today" notice in the sidebar notice card.

## Acceptance criteria

- [ ] Rating a card "Again" brings it back in the same session. "Easy"
      pushes it out by days, per `fsrs.ts`.
- [ ] Two students reviewing the same card get independent schedules.
- [ ] "Review in video" opens the player at the card's time.
- [ ] The existing `lib/study` tests still pass.
- [ ] `npm run build` passes.
