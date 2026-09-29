# Feature 21: Calendar, announcements, discussions, notifications

**Status:** Done (2026-09-29)
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

- [x] "Coming up" on Student home shows the seeded assignment due date.
      (Checked in the database and over HTTP on the production build as the
      Demo Student.)
- [x] A refusal leads to "Ask your instructor", then a thread. The admin
      sees it in "Unanswered questions" and replies. The student gets a
      notification. (Checked against the real database with the statements
      the actions batch, and the pages over HTTP. The dialog and the bell
      haven't been clicked in a browser yet.)
- [x] `npm run build` passes.

## Implementation notes (as built)

- **Schema** (migration 0016, which also backfills events for existing
  assignments and graded quizzes). Beyond the spec's columns:
  - `events.lessonId`: the lesson a due date or quiz belongs to. Students
    see the event only while that lesson and its module are published, and
    deleting the lesson deletes the event.
  - `events.createdBy`.
  - A unique `(kind, sourceId)`, so each assignment and quiz has one event,
    which re-saving moves.
  - `notifications.dedupeKey`, unique per user, so the daily task never
    sends a notice twice.
  - A partial unique index, so a thread has at most one answer.
- **Access** is in the SQL of every read. Staff (admins included) see
  everything in their courses. Students see things while actively enrolled
  in the published course, and anything tied to a lesson only while it is
  visible. Notifications are the recipient's alone.
- **Calendar** (`/calendar`): month grid (Monday first) and agenda, with
  `?month=2026-10` and `?view=agenda` in the URL. Days follow the reader's
  time zone: the server renders UTC, and the browser regroups after
  hydration. Butter tile = a deadline within three days that isn't done. A
  due date the student has handed in shows "Handed in". A due event takes
  its lesson's current title.
  - Staff add **live sessions** (the meeting link is required, http(s)
    only) and **other** events in the course builder's new Calendar tab.
    Due dates and quizzes come from their own forms and can't be removed
    there.
- **Coming up** = the next three events. On phones it's a Butter notice
  with the next open deadline (wireframe 07).
- **Announcements**: "Post announcement" (secondary) on `/instructor` and
  Messages. One batch writes the post, a notification for each student
  actively enrolled in the published course (not the author) and the audit
  row. Students read them in a new Announcements tab on the course page,
  which `?tab=announcements` opens. Staff can delete them from Messages.
- **Discussions**:
  - The whole class can read a thread. Anyone in the course can reply.
    Only staff mark or clear the answer; marking makes the thread
    `answered`, clearing makes it `open` again.
  - "Unanswered questions" = open threads, longest waiting first.
  - Staff reply with "Mark my reply as the answer", on by default while the
    thread is open.
  - Routes: students use `/discussions` and `/discussions/[id]`
    (`?show=mine|open`). Staff use `/instructor/messages` and
    `/instructor/messages/[id]`: instructors can't open the student shell.
  - Discussion tab in the lesson player.
  - "Ask your instructor" in the refusal opens a dialog pre-filled with the
    refused question (plus a line saying the assistant couldn't find it)
    and the lesson being watched. The student can edit it before posting.
- **Posts render without raw HTML** (`renderPostMarkdown`): Markdown and
  $-math only; images become links. Other readers see what students
  write, so no one can style or overlay the page.
- **Notifications**: the bell sits in the sidebar's logo row on desktop
  and in the top bar on phones and on course pages. It shows a Butter
  unread count. Choosing a notification marks it read and opens it; there
  is also "Mark all as read". The bell reads `GET /api/notifications` on
  load, on navigation, on focus (at most every 20 s) and every 90 s while
  visible. Triggers:
  - Grade returned: "…is back" the first time, "…was updated" after a
    correction; a draft stays quiet.
  - Announcement posted.
  - A reply to my thread, from anyone else.
  - Due soon: the daily `notify-due-soon` task (06:00 UTC) sends one
    notice per student for each visible assignment due in the next 24
    hours that they haven't handed in. It runs as one SQL statement.
- **Seed**: a welcome announcement and one open question from the Demo
  Student (so step 1's "Unanswered questions" isn't empty). The
  assignment's event is kept in step with its due date. `demo:reset`
  deletes the student's threads and replies and both accounts'
  notifications, then puts the question back.
- **Not built**: editing or deleting threads and replies, moderation, a
  full notifications page, email and push (out of scope), "draft ready"
  notifications for instructors (`architecture.md`, video pipeline step
  12), and due-soon notices for graded quizzes (the spec names
  assignments).
