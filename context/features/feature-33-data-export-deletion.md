# Feature 33: Data export and account deletion

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 26 (feature 32, private messages, is parked; if it comes back, its messages join the export and the erase)
**Demo step:** —
**Source:** `report.md` (production-readiness audit, 2026-09-29): R9.
`project-overview.md` promises "Data export and deletion" (Platform).

## Goal

A person can download their data. Deleting an account removes their
private data and keeps only the academic records the institution must keep.

## What happens today

- **A deleted Clerk user is only flagged.** `app/api/webhooks/clerk/route.ts:35-38` sets `users.deletedAt` and nothing else.
- **Their data stays indefinitely:** name and email, private notes, chats and submissions, plus the files in `private/{userId}/`.
- **A hard delete would fail.** Ten foreign keys to `users.id` have no delete rule: `audit_log`, `ai_usage`, `jobs`, `course_staff`, `enrollments`, `videos`, `graded_quizzes`, `submissions`, `grades` and `announcements`.

## Scope

**In:**
- **Self-serve export** (Profile → "Download my data"):
  - A background task builds one JSON file containing the person's profile, enrollments, watch progress, lesson notes, flashcard reviews, quiz attempts, submissions (with links to their files), grades and feedback, discussion posts, private notes and assistant chats.
  - The file goes to `exports/{userId}/` and is served through an access-checked route. It's deleted after 7 days.
  - The file is built in a task, never inside a request.
- **Erase:**
  - Triggered by the Clerk `user.deleted` webhook, or by an admin's **Delete user** action (with a confirm step).
  - A task deletes the person's private notes and their files, chats, lesson notes, card reviews, watch progress, and discussion posts or their text (see the decision below). It also cancels their running jobs.
  - It anonymises the `users` row: the name becomes "Deleted user", the email is cleared, and the id is kept for the audit trail.
- **A migration** that adds the missing delete rules:
  - `set null` where a record must outlive the person: audit and AI usage actor, `createdBy` columns.
  - `cascade` where it mustn't.
- The demo accounts can't be deleted while in demo mode.

**Out:**
- Legal retention rules for a particular country.
- Removing data from backups.

## Decisions needed

1. **Academic records.** Recommended: keep submissions, grades and graded quiz attempts, attached to the anonymised user. Delete everything else. Alternative: delete everything.
2. **Discussion posts from a deleted user.** Recommended: keep the post and show "Deleted user", so class threads still read correctly.

**Decided (2026-09-30):** both as recommended. The owner asked for the
feature to be built with them.

## Implementation decisions

Settled before building, so the code has one reading.

- **The erase anonymises, it doesn't delete the `users` row.**
  - The name becomes "Deleted user", the email `''` and the picture null.
  - The row keeps its id, so kept records and the audit trail still point somewhere.
  - It keeps its `clerkId`, so a late `user.updated` webhook finds the deleted row instead of creating a new one.
  - The sync never overwrites a deleted row's name or email.
  - The task sets `users.erasedAt` when it finishes.
- **What goes:**
  - private notes, with everything made from them;
  - the person's documents and every file under `private/{userId}/` and `exports/{userId}/`. The folders are listed, so a stray upload goes too;
  - assistant and space chats, lesson notes, card reviews and watch progress;
  - practice quiz attempts;
  - notifications, data exports, and invitations to their email address;
  - `course_staff` rows.
- **What stays:**
  - submissions (with their files), grades and graded quiz attempts;
  - discussion threads and replies, shown under "Deleted user";
  - announcements;
  - `ai_usage` and `audit_log`;
  - content they made for a course (videos, documents, podcasts, graded quizzes);
  - enrollments, set to `dropped` (kept for the record, like any dropped enrollment).
- **Order:** cancel the person's unfinished runs, then delete the rows and anonymise (one batch), then delete the files. A failed file delete fails the task, and its retry finds the files again by listing the folders.
- **Who starts an erase:**
  - The Clerk `user.deleted` webhook.
  - An admin's **Delete user** on `/admin/users`. It deletes the Clerk account first, then marks the row deleted, then starts the task.
  - Both use the key `user:{id}:erase`, so the two never run twice.
  - The action refuses the admin's own account, and the demo accounts while in demo mode.
  - The confirm step asks for the person's email, typed.
- **Nothing is left half-erased:** the daily `prune-old-rows` finishes any deleted account that still isn't erased an hour later, up to 20 a run.
- **Export:**
  - A `data_exports` row (building / ready / failed) is written with its `expires_at` (7 days).
  - At most 3 requests per person per 24 hours, counted and written in one locked batch (`lib/db/limits.ts`).
  - The task `export-user-data` writes `exports/{userId}/…json`.
  - `/exports/[exportId]` redirects the owner to the file until it expires; anyone else, or after expiry, gets a 404.
  - The daily clean-up deletes expired files, then their rows.
- **Export contents:**
  - Grades are included only once returned, since a draft grade is staff-only.
  - Files are linked through the access-checked routes (`/submissions/…/files/n`, `/documents/…`) on `NEXT_PUBLIC_APP_URL`, never by their Blob URL.
- **Where:** the Profile page, which students and admins have. Instructors have no Profile page (feature 28), so their self-serve export is an open question in the progress tracker.

## Acceptance criteria

- [x] The demo student's export contains every listed category and nothing from any other user.
- [x] The export link works for its owner and returns 404 for anyone else. The file is deleted after 7 days.
- [x] Deleting a test user:
  - their private notes, chats and files are gone (`headBlob` returns nothing);
  - their row is anonymised;
  - academic records and audit rows follow the decisions.
- [x] A late Clerk `user.updated` webhook doesn't bring the user back (feature 24).
- [x] `npm run build`, lint and tests pass.
