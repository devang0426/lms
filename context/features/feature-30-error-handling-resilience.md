# Feature 30: Error handling and resilience

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 24
**Demo step:** all
**Source:** `report.md` (production-readiness audit, 2026-09-29): R1
(software part), R2, R3, R7, R11, R12.

## Goal

When something goes wrong, the user keeps their page and their work and
sees a clear message. The team can find the cause in the logs.

## Scope

**In:**
- Server actions that return a typed error instead of crashing the page.
- Error pages for every shell and for the root.
- Time limits on the streaming routes.
- Server errors logged in one place, ready for Sentry later.
- ~~An e2e job in CI that resets its own data.~~ Dropped (owner's call, 2026-09-30): no e2e in CI; the suite runs locally.
- Missing indexes.
- Log retention.
- The "drafts ready" notification.

**Out** (deferred until paid plans):
- Sentry or any other paid monitoring.
- Neon backups beyond the free plan's restore window, which is up to 6 hours.

## Tasks

1. **Safe server actions** (R2):
   - Add `lib/utils/safe-action.ts`. It wraps an action body, catches unexpected errors, logs them with a short reference id, and returns `fail("internal", "Something went wrong. Try again. (ref ab12cd)")`.
   - Apply it to every action.
   - `retryVideo` and `retryDocument` return an `ActionResult` instead of `void`.
   - Client callers show the error in place, for example `components/coursework/grade-form.tsx:39` and `components/study/flashcard-deck.tsx:72`.
   - Today a database "fetch failed" throws to `error.tsx`. That replaces the page, so typed feedback is lost and a flashcard session resets.
2. **Error pages** (R3):
   - Add `app/global-error.tsx`.
   - Add `error.tsx` to `(student)/(focus)`, `(student)/(topnav)` and `(auth)`.
   - Each one keeps its shell and offers "Try again" plus a way home.
3. **Streaming time limits** (R7):
   - Export `maxDuration` from `app/api/assistant/route.ts` and `app/api/space/chat/route.ts`. Hobby's limit is 300 s.
   - Cap the engine's total time (timeouts plus fallbacks, `lib/ai/engine/openai.ts:71`) below it.
   - A request that hits the limit ends with "That took too long. Try again." and the turn is saved.
4. **One place for server errors** (R1, software part):
   - `instrumentation.ts` → `onRequestError` writes one structured log line: the route, the digest, the user id and the error.
   - Vercel's logs show it now. A Sentry hook can go in the same place later.
5. ~~**CI end-to-end job** (R11)~~: dropped (2026-09-30). The owner doesn't want e2e in CI, and the CI e2e job was removed. The Playwright suite runs locally against a build without a demo passcode.
6. **Indexes** (R12), in one migration:
   - `audit_log (created_at)`: the admin page sorts by it.
   - `card_reviews (card_id)`: cascades.
   - Time indexes for the dashboard's activity query (`watch_progress.updated_at`, `card_reviews.last_review`, `quiz_attempts.started_at`, `chat_turns.created_at`, `submissions.submitted_at`), if the query counter from feature 29 shows it's slow.
7. **Retention** (R12):
   - A daily scheduled task deletes read notifications and finished `jobs` rows older than 90 days.
   - `ai_usage` and `audit_log` are kept.
8. **"Drafts ready" notification** (architecture.md, video pipeline step 12):
   - When `video-process` finishes drafting, the uploading instructor gets an in-app notice that links to the review screen.
   - This needs the new notification kind `draft_ready`, added to the enum in a migration.

## Decision needed

- ~~**Retention periods.** Suggested: 90 days for read notifications and finished jobs. Keep `ai_usage` and `audit_log`.~~ Taken as suggested (2026-09-30). Each entity keeps its newest run of each kind, which pages read for their state.

## Acceptance criteria

- [x] An action that hits a database error shows an inline message with a reference, and the page and typed text stay. (A production server with the database unreachable: `rateCard` answered `internal` with "Something went wrong. Try again. (ref …)", with one log line carrying the same ref. The action returns instead of throwing, so the form keeps its state; `settle()` covers a request that never arrives.)
- [x] An error thrown in each shell shows that shell's error page with its navigation. (Checked in Chrome on a production build: sidebar, focus, top nav, instructor, admin and sign-in.)
- [x] An assistant request that hits the time limit ends with the message, and the turn is saved. (Unit test with a short limit. The question is saved before the answer starts, and nothing is saved after the limit.)
- [x] A thrown page error produces one `onRequestError` log line. (Repeats of the same failure from a page's layouts are folded into one.)
- [x] The index migration is applied, and the retention task deletes only what it should (unit tested). (0019 on the dev DB; the rules are unit tested, and the SQL was checked on fixtures.)
- [x] Uploading a lecture ends with a "Drafts ready" notice for the teacher. (`notifyDraftsReady` checked against the dev DB. A full upload through the dev worker wasn't run.)
- [x] `npm run build`, lint and tests pass.
