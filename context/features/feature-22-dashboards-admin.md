# Feature 22: Dashboards and admin

**Status:** Done (2026-09-29)
**Depends on:** 20, 21
**Demo step:** 1

## Goal

The Instructor dashboard (wireframe 06) with real numbers, and the admin
screens needed to run the university.

## Scope

**In:**
- Instructor overview stats.
- Courses table.
- The "Needs grading" list.
- Simple analytics.
- Admin users, roles, enrollments, terms, audit log and CSV roster import.

**Out:**
- SIS sync.
- Advanced reporting.

## Files

- `/instructor` (wireframe 06):
  - Stat cards:
    - **Active learners:** students with activity in the last 7 days.
    - **Avg. completion.**
    - **Waiting for grading:** butter "attention" card.
    - **Unanswered questions.**
  - Courses table (status badge, learners, completion bar).
  - "Needs grading" list.
- `/instructor/analytics`:
  - Per lecture: a watch heat-strip from the `watchedRanges` totals (where
    students re-watch or drop off).
  - Most-asked assistant topics, grouped by chapter, with no student names.
  - Refusal rate.
  - AI cost per feature, from `ai_usage`.
- `/admin/users`:
  - List and search.
  - Change the role, which updates Clerk `publicMetadata` and Neon.
  - Invite (Clerk invitation).
- `/admin/roster`: CSV import (`email,name,role,course_code,section`) with
  a preview, validation errors per row, then apply. Creates Clerk
  invitations and enrollments.
- `/admin/terms`, `/admin/audit`: a filterable audit log.

## Acceptance criteria

- [x] With seeded data, the dashboard numbers match the database, checked
      by hand. (Each number was compared with separate hand-written SQL.)
- [x] The analytics heat-strip shows the demo student's watched ranges.
      (Their ranges, and not staff's or an outsider's; warm and cold where
      they watched and didn't.)
- [x] A CSV with 1 bad row imports the good rows and reports the bad one.
      (Tested with three bad rows: each was reported with its reason, and
      the good rows were imported.)
- [x] Role changes appear in the audit log. (Checked end to end: the role
      in Clerk, then Neon, then `user.role_change` in the log.)
- [x] `npm run build` passes.

## Implementation notes (as built)

- **`/instructor`** (wireframe 06). Everything is scoped to the viewer's
  courses in SQL; admins see all courses.
  - Stat cards:
    - **Active learners:** distinct enrolled students who, in the last 7
      days, watched, reviewed a card, took a quiz, asked the assistant,
      handed in work or posted in a discussion. Shown "of N enrolled".
    - **Avg. completion:** completed published lessons ÷ published
      lessons, averaged per enrollment.
    - **Waiting for grading:** Butter, with how long the oldest has
      waited.
    - **Unanswered questions.**
  - Courses table: status, learners (with "active this week"), and a
    completion bar.
  - "Needs grading" (top 5), and feature 21's "Unanswered questions".
- **`/instructor/analytics`** (`?course=` for each course taught):
  - A heat-strip per lecture: 60 slices, each Sage by the share of
    students who watched at least half of it, with chapter ticks. A
    sentence says how many watched and where fewer than half are still
    watching.
    - `watch_progress` keeps *merged* ranges, so this shows coverage and
      drop-off; re-watching isn't recorded.
  - Most-asked topics: students' assistant questions, grouped by the
    chapter each answer's first citation points into. No names or
    questions are shown.
  - Refusal rate.
  - AI cost per feature (last 30 days and all time), university-wide:
    `ai_usage` isn't per course.
  - Students only: staff questions, previews and private-space chats are
    left out.
- **`/admin/users`:**
  - Search and a role filter (`?q=`, `?role=`).
  - The role is a select with a confirm step. It changes Clerk first, then
    Neon plus a `user.role_change` audit row. You can't change your own
    role.
  - Access follows the role: a demoted instructor's `course_staff` rows
    go, and a promoted student's enrollments are dropped (kept for audit).
    `course_staff` grants staff access whatever the role.
  - **Invite** sends a Clerk invitation, with the role in its metadata.
    Someone already in Clerk is linked instead.
  - A **Pending invitations** list with Withdraw.
- **`/admin/roster`:**
  - Choose or paste a CSV, then **Check file** (writes nothing) or
    **Import** (plans again on the server). Each row gets a result and a
    reason.
  - Courses match by code in the current term. A student's missing
    section is created (the preview flags it). Roles are student or
    instructor only; admins are made on the Users page.
  - An existing account is enrolled or added to the course's staff. A
    Clerk account that has never opened Studyhall is linked first.
    Anyone else gets a Clerk invitation, plus an `invitations` row
    (migration 0017) that their first sign-in turns into the enrollment
    (`syncUserFromClerk` → `applyPendingInvitations`).
  - Up to 500 rows / 200 KB per file. Invitations go ten per Clerk
    request; if a request fails, each address is retried alone.
  - Re-importing the same file changes nothing ("Already enrolled",
    "Already invited").
- **`/admin/terms`:** add a term, and make one current. The catalog and
  the roster import use the current term.
- **`/admin/audit`:** filter by action, entity type and who did it
  (`?action=`, `?entity=`, `?actor=`), 50 per page. The "Older entries"
  cursor is a row id, compared in SQL: JavaScript dates drop Postgres's
  microseconds, and rows in one batch share a timestamp.
- **`syncUserFromClerk`** moved to `lib/auth/sync.ts` (re-exported from
  `lib/auth`), using `@clerk/backend`. It can now run outside Next.js
  (scripts, tasks).
- **Not built:** the Learners page (not in this spec; still a
  placeholder), a grade-weights editor, sections management beyond the
  roster, and editing or deleting terms.
