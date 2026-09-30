# Feature 24: Security lockdown

**Status:** Done (2026-09-30)
**Depends on:** 23
**Demo step:** all
**Source:** `report.md` (production-readiness audit, 2026-09-29): S1, S4,
S5, S7, S8, S10, S11, S13, and the reset-script guard from R10.

## Goal

Close the loopholes that let an outsider or a student get more than their
role allows. This must be done before anyone outside the team gets the URL.

Software only: no new services and no plan changes.

## Scope

**In:**
- Demo mode that can't be turned on by accident, and can't hand admin rights to strangers.
- Graded quizzes that don't give away their answers.
- The private-upload loophole.
- Assistant answers rendered without raw HTML.
- Config checked at startup.
- The smaller hardening items listed under Tasks.
- A real `context/security-architecture.md`.

**Out:**
- AI spend limits and rate-limit races (feature 25).
- A private Blob store with signed links. This is deferred until paid plans; see `../progress-tracker.md` → Next Up.
- A nonce-based CSP. It needs every page rendered per request.

## Tasks

### 1. Config checked at startup

- Add `lib/env.ts`: a zod schema over every `process.env` variable the app reads, with each one marked required or optional.
- Check it once from `instrumentation.ts` → `register()`.
- If anything is missing, fail with one message that names every missing variable.
- Today, missing variables only fail when first used:
  - A missing Trigger key leaves a video stuck in "processing" (feature 26).
  - A missing Blob token shows only "The upload couldn't be started."
- The schema includes `NEXT_PUBLIC_APP_URL`. It is documented in `example.env` but never read.

### 2. Demo mode (S1)

Today, `startDemoSession("admin")` is a server action anyone can call:
- It needs no sign-in, and its only gate is `DEMO_MODE=true`.
- It creates the admin account if it's missing, and re-promotes it if it was demoted.
- References: `app/(auth)/demo-actions.ts:14` and `lib/demo/accounts.ts:43-84`.

Changes:
- **Passcode in production:** in production (`VERCEL_ENV=production`), demo mode needs a `DEMO_PASSCODE`.
  - `lib/env.ts` refuses to start with `DEMO_MODE=true` and no passcode.
  - The sign-in picker asks for the passcode.
  - `startDemoSession` compares it in constant time before minting a ticket.
- **No lasting admin access while in demo mode:** `changeRole`, invitations and roster **Import** are refused with the message "Turned off in demo mode." Roster **Check file** keeps working.
  - This stops a visitor from promoting a second account of their own, which would outlive demo mode.
- **`example.env`:** change it to `DEMO_MODE=false`. It still ships `true`, although the feature 23 notes say it was changed.
- **`/dev/*` pages (S13):** return `notFound()` unless `NODE_ENV === "development"`. `/dev/jobs` stays admin-only in development.

### 3. Graded quizzes (S4)

Today, `submitGradedAttempt` (`lib/db/quizzes.ts:224-272`) returns the correct answers and explanations after every attempt. The best attempt counts, so attempt 1 can be used to read the answers.

Changes:
- **Before the reveal point:** return only the score and right/wrong per question.
  - The quiz runner (`components/study/quiz-runner.tsx`) shows "Answers are shown after the due date."
- **After the reveal point:** return and show the correct answers and explanations.
  - Recommended reveal point: the due date. See the decision below.
- **Submit deadline:** an attempt must be submitted by `dueAt` plus a grace period (10 minutes). Later submits return `closed`.
  - Today only the start time is checked, so an attempt started early can be submitted days later.

### 4. Private uploads (S5)

- **Only a note waiting for its file:** `uploadDeps.ownsDocument` (`lib/storage/blob.ts:130`) also requires `status = 'uploading'` and no blob yet.
- **Every upload counts:** the hourly limit counts every completed upload by file path. Today, private uploads are de-duplicated by document id (`lib/storage/blob.ts:70`), so repeat uploads are free.
- **No second file:** if a private document already has a file, `recordUpload` deletes the new blob.

### 5. Assistant answers (S7)

- **Escape raw HTML:**
  - In assistant and space-chat answers, escape raw HTML in the model's text before parsing Markdown.
  - Then insert the citation chips (built in `lib/chat/citations.ts`, rendered by `components/assistant/answer-body.tsx:36`) and the maths.
  - `renderPostMarkdown` already escapes raw HTML the same way.
- **`style` only on maths:**
  - Allow `style` only on KaTeX output.
  - `MATH_SAFE` (`lib/markdown.ts:299`) currently allows it on every element. That's what lets an injected `<a style="position:fixed;inset:0">` cover the page.
- **Delimit sources in the prompt:** wrap each retrieved source in clear delimiters, and say that text inside them is course material, not instructions.
  - This changes prompt wording, which is a protected file: bump `PROMPTS_VERSION`.

### 6. Smaller items

- **CSP blob host (S8):** allow only this app's Blob host, from a new `BLOB_PUBLIC_HOST` variable checked in `lib/env.ts`. Today `next.config.ts:30` allows `*.public.blob.vercel-storage.com`.
- **Invitation links (S10):** build them from `NEXT_PUBLIC_APP_URL`, not request headers (`lib/admin/links.ts:8-11`).
- **Deleted users (S11):** a webhook update must never clear `deletedAt` (`lib/auth/sync.ts:52`). Today a late `user.updated` brings a deleted user back.
- **Reset guard (R10):** `scripts/reset-demo.ts` refuses to run unless the database host is in a `DEMO_DB_HOSTS` allowlist. Pointing it at the wrong database would wipe that database.

### 7. Docs

- **Write `context/security-architecture.md`.** `AGENTS.md` lists it, but it doesn't exist. Describe the layers the app really has:
  - Clerk auth and roles.
  - Access checks in SQL.
  - Upload authorization.
  - The SSRF guard.
  - Sanitizing.
  - CSP and headers.
  - Rate limits and the daily AI budget (feature 25).
  - CSRF: the server-action origin check, plus Origin checks on the API routes.
  - zod request validation.
  - The audit log.
  - Prompt-injection handling.
  - The demo-mode rules.
- **Leave `AGENTS.md` alone.** It's a protected file, regenerated by `next dev`.

## Decision needed

- **When graded quiz answers are revealed.** Recommended: **after the due date**. Revealing after a student's last attempt lets answers spread to classmates before the deadline.
- **Resolved (2026-09-30): after the due date**, as recommended. Precisely, at the end of the submit window (due date + 10-minute grace). Revealing at the due date itself would let a student who still has an attempt open read the answers and then submit inside the grace period.

## Acceptance criteria

- [x] With `VERCEL_ENV=production`, `DEMO_MODE=true` and no `DEMO_PASSCODE`, the app refuses to start with a clear message. With a passcode set, the picker asks for it, and a wrong one is refused.
- [x] In demo mode, role changes, invitations and roster Import are refused with the message. Check file still works.
- [x] `/dev/*` returns 404 on a production build.
- [x] Graded quiz with 2 attempts and a future due date:
  - After attempt 1, the student sees the score and which answers were wrong, but not the correct answers.
  - After the due date, the student sees everything.
  - A submit after due date + grace is refused.
- [x] A private-upload token for a note that is already ready is refused. There is a unit test in `lib/storage/authorize.test.ts`, plus a manual check.
- [x] An answer containing `<a style="position:fixed;inset:0" href="…">` renders as text. Citation chips and maths still render.
- [x] Removing a required variable stops startup with one message naming it.
- [x] `demo:reset` against a host not in the allowlist exits without changing anything.
- [x] `context/security-architecture.md` exists and matches the code.
- [x] Unit tests for each change. `npm run build`, lint and tests pass.

How each was checked is in `../progress-tracker.md` (Completed → feature 24).
