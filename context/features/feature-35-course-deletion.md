# Feature 35: Course deletion

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 26 (lesson clean-up), 30 (safe actions)
**Demo step:** —
**Source:** the owner, 2026-09-30: "I am not able to delete a course." No
earlier spec covered it. The owner chose the recommended rule below.

## Goal

A course made by mistake, or a test course, can be deleted with everything
in it. A course that students use or used can't be deleted: it's
unpublished instead, so its records stay.

## The rule

A course can be deleted only when **all** of these hold:

- No student is actively enrolled in any of its sections. Dropped
  enrollments go with the course; their history stays in the audit log.
- Nobody has handed in work in it: no submission to any of its
  assignments, and no submitted graded quiz attempt. The code standards
  keep submissions and grades for audit.
- No invitation to it is waiting to be accepted. Withdraw those first
  (Admin → Users); otherwise the invitee would join to find no course.

Anything else is refused with the reason and "Unpublish it instead".

**Who:** the course's staff: its instructors and admins, the same people
who edit it in the builder.

## Scope

**In:**
- A "Delete this course" section at the foot of the builder's Details tab.
- A confirm dialog that says what goes (modules, lessons, their videos,
  documents and podcasts, and the course's discussions, announcements and
  calendar) or why it can't be deleted. The course code must be typed to
  confirm.
- The server checks the rule again inside the delete statement itself, so
  a student enrolled or a submission made meanwhile still stops it.
- Clean-up, in the order feature 26 set for lessons:
  1. Collect the files, and cancel the unfinished runs.
  2. Delete the course. Its sections, enrollments, staff, modules,
     lessons, content, chunks, threads, events, announcements, discussions
     and invitations cascade.
  3. Delete the files from Blob, best effort.
  - Notifications that link into the course are deleted in the same
    statement.
- A `course.delete` audit row (code, title, what went), written by the
  same statement as the delete.

**Out:**
- Deleting a course with students or their work (no override, not even
  for admins). Unpublish it.
- An archive state, or restoring a deleted course.
- Deleting a term.

## Acceptance criteria

- [x] An empty or test course can be deleted from the builder after typing
  its code. It's gone from the lists, and its files are deleted. (Chrome, production build; files go through the same `deleteBlobs` path as a module.)
- [x] A course with an active student, handed-in work, a submitted graded
  attempt or a pending invitation is refused with the reason, and nothing
  is deleted. (Each case checked on the dev DB; MATH 201 refused in Chrome.)
- [x] The rule is checked in the delete statement itself, not only before.
- [x] Unfinished runs for its lessons are cancelled. (`lessonLeftovers({ courseId })`, then `cancelJob`, as for a module.)
- [x] One `course.delete` audit row per deleted course.
- [x] Only the course's staff can delete it; anyone else gets "not found". (`asCourseStaff`, as for every builder action.)
- [x] `npm run build`, lint and tests pass.
