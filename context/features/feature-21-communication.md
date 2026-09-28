# Feature 21: Calendar, announcements, discussions, notifications

**Status:** Not started
**Depends on:** 20
**Demo step:** 4 ("Coming up"), 6 ("Ask your instructor")

## Goal

The course's social and time layer: what's due, what's new, and questions
to the instructor.

## Scope

**In:**
- Calendar.
- Announcements.
- Discussions (Q&A threads).
- In-app notifications.

**Out:**
- Email.
- Push notifications.
- Live sessions (external links only).

## Schema

- `events`: id, courseId, kind (`due | live | quiz | custom`), title, at,
  url, sourceId. Assignments and graded quizzes create these
  automatically.
- `announcements`: id, courseId, authorId, title, body, createdAt.
- `discussions`: id, courseId, lessonId (nullable), authorId, title, body,
  status (`open | answered`), createdAt.
- `discussion_replies`: id, discussionId, authorId, body, isAnswer,
  createdAt.
- `notifications`: id, userId, kind, title, url, readAt, createdAt.

## Files

- `/calendar`: a month and agenda view with date tiles. Student home
  "Coming up" shows the next 3 events.
- Announcements:
  - The instructor posts from the dashboard ("Post announcement").
  - Students see them on the course page.
- Discussions:
  - `/discussions` and a Discussion tab in the lesson.
  - The assistant refusal's "Ask your instructor" opens a new thread,
    pre-filled with the question and lesson.
  - The instructor can mark a reply as the answer.
- Notifications:
  - A bell with an unread count (the header button).
  - Notifications are created on: grade returned, announcement posted,
    reply to my thread, assignment due in 24 hours.
  - "Due soon" notifications are created by a daily Trigger.dev scheduled
    task.

## Acceptance criteria

- [ ] "Coming up" on Student home shows the seeded assignment due date.
- [ ] A refusal leads to "Ask your instructor", then a thread. The admin
      sees it in "Unanswered questions" and replies. The student gets a
      notification.
- [ ] `npm run build` passes.
