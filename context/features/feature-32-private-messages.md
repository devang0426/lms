# Feature 32: Private messages

**Status:** Parked. The owner removed it from the plan for now (2026-09-30). Don't build it until it's brought back.
**Depends on:** 25, 28
**Demo step:** new (see below)
**Source:** the messaging gap found after the audit (2026-09-29).

## Goal

A student can message their course's teachers privately and get an answer.
Teachers have one inbox for all their courses.

## What exists today

Nothing private. These are the only things that pass between a student and
a teacher:

- **Course discussions** (`discussions`, `discussion_replies`). The whole class reads them, with names shown.
- **Announcements** (`announcements`). Teacher to class only.
- **Assignment feedback** (`grades.feedback`). Private, but tied to one assignment.

The teacher's nav item "Messages" is really the course Q&A. Feature 28
renames it "Questions".

## Scope change

This is a new feature. When it starts, add it to `project-overview.md`
under LMS core (communication) and to the storage model in
`architecture.md`.

## Scope

**In:**
- Private conversations between one student and the staff of one course. Each has a subject, and a student can start several.
- A **Messages** page for students and an **Inbox** for staff that covers all their courses. Both show unread counts.
- An in-app notification when a new message arrives.
- "Ask your instructor" (the assistant's refusal) offers a choice: **Private message** or **Class question**.
- Posting limits, using feature 25's locked pattern.

**Out:**
- Messages between students.
- Group chats.
- Attachments, for now.
- Email or push notifications.
- Parent accounts.
- Live typing indicators. Refreshing on focus is enough.

## Data (a new migration)

- **`conversations`:**
  - `id`, `courseId` (cascade), `studentId` (a user), `subject`.
  - `createdAt`, `lastMessageAt`.
  - Index on `(courseId, lastMessageAt)`, and one on `studentId`.
- **`messages`:**
  - `id`, `conversationId` (cascade), `authorId`, `body`, `createdAt`.
  - `body` is Markdown, rendered with `renderPostMarkdown`, so raw HTML is escaped.
- **`conversation_reads`:**
  - `(conversationId, userId)` as the key, plus `lastReadAt`.
  - Used for unread counts.
- **Notifications:** a new `message` kind (an enum migration). The link opens the conversation, and there is at most one unread notice per conversation.

## Access (inside every query)

- **The student:** only while actively enrolled in the course. After dropping, they can read their conversations but not reply.
- **The course's staff:** read and reply to all of the course's conversations.
- **Admins:** see the decision below.
- **Everyone else:** 404.
- **Audit:** rows carry ids only, never the message text, the same as private notes.

## Other tasks

- **Limits:** 20 messages an hour per student and 5 new conversations a day.
- **Nav:** add "Messages" for students (in the phone tab bar's More sheet), and "Inbox" for staff, with the unread count.
- **Demo reset:** add a cleanup step to `RESET_STEPS` in `scripts/reset-demo.ts`, and seed one conversation for the demo.
- **Data export:** feature 33 includes a student's messages.

## Decisions needed

1. **Admins reading messages.** Recommended: admins can see that a conversation exists and who is in it, but not the text. Reading it would need a logged "safeguarding access" step. Alternative: admins read everything.
2. **Several conversations with subjects** (recommended), or **one ongoing conversation** per student and course?

## Acceptance criteria

- [ ] The demo student starts a conversation. The course's instructor sees it in the Inbox with an unread badge and gets a notification. The instructor replies, and the student sees the reply.
- [ ] Another student in the same course, and an instructor of another course, get 404. Admin access follows the decision.
- [ ] A dropped student can read their conversations but not reply.
- [ ] A body containing HTML shows as text.
- [ ] The limits hold under parallel requests.
- [ ] `npm run demo:reset` restores the seeded conversation.
- [ ] `npm run build`, lint and tests pass.
