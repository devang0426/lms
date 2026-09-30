# Feature 25: AI spend guardrails

**Status:** Done (2026-09-30)
**Depends on:** 24
**Demo step:** 6, 7, 8
**Source:** `report.md` (production-readiness audit, 2026-09-29): S2, S3,
S12.

## Goal

One student, or a newly created account, can't run up the AI bill or use up
the shared free-model quota. Normal study must never be blocked.

## Scope change

`project-overview.md` lists "AI credits, quotas or budgets per student" as
out of scope. Invariant 9 in `architecture.md` says AI usage is logged
only. This feature changes both: it adds a **daily safety limit per
person**. It is not a credit or payment system.

When this feature starts, update both files. The owner must approve the
change and the limits (see Decisions).

## Why a limit on calls as well as cost

Free models (`:free`) log a cost of $0. But they share one quota for the
whole app key:
- 20 requests a minute.
- 1,000 requests a day (once $10 of credit has been bought).

A single student looping questions can use that quota up for everyone.
Once it's gone, calls fall through to the paid models. So the limit counts
**AI calls** as well as **cost**.

## Scope

**In:**
- A daily AI limit per person (calls and cost), checked before any AI work starts.
- Length limits on audio and YouTube sources.
- Retry only for work that failed.
- Rate limits that can't be beaten by sending requests in parallel.
- A posting limit on discussions.
- Admins can see who is near or at the limit.

**Out:**
- Credits, paid top-ups, per-course budgets.
- Changing the model chains. They stay free-first while on free plans; paid-only chains are on the deferred list.

## Tasks

### 1. Daily limit

- Migration: add an index on `ai_usage (user_id, created_at)`. Today there is only `(feature, created_at)`.
- Add `lib/ai/budget.ts`:
  - `usageToday(userId)` returns the calls and the cost over the last 24 hours.
  - `checkBudget(user)` returns `ok`, or a refusal that says when the limit resets.
  - Limits come from environment variables, per role:
    - `AI_DAILY_CALLS_STUDENT`, `AI_DAILY_USD_STUDENT`
    - `AI_DAILY_CALLS_STAFF`, `AI_DAILY_USD_STAFF`
- Check the limit **before** starting each of these:
  - an assistant question (`app/api/assistant/route.ts`);
  - a private-space chat question (`app/api/space/chat/route.ts`);
  - a new private note and a note retry (`app/(student)/(sidebar)/space/actions.ts`);
  - podcast generation, for a lesson or a note (`podcast-actions.ts`);
  - regenerating drafts on the review screen.
- Background tasks already charge the person who started them (`withUsage(feature, userId)`). Check that every task passes the user id. A row with a null `user_id` can't be counted against anyone.
- When a request is refused:
  - Show "You've reached today's AI limit. It resets at HH:MM."
  - Log an `ai.limit_reached` audit row, holding ids only.
- Admin view: `/admin/users` gets an "AI today" column (calls and cost) and a filter for people at the limit.

### 2. Length limits (S2)

- Audio and YouTube documents currently have no length cap. Lesson videos already have `VIDEO_MAX_MINUTES` (`lib/video/probe.ts:13`).
- Check the duration **before** transcribing:
  - ffprobe on the downloaded audio file;
  - yt-dlp metadata for YouTube, before downloading.
- Reject anything over `DOCUMENT_MAX_MINUTES` (default 90) with a clear message.
- The code is in `trigger/lib/ingest-document.ts` and `trigger/lib/transcribe.ts`.

### 3. Retry only after a failure

- `retryNoteRun` (`lib/space/index.ts:82-89`) works only when the note's latest ingest **failed**.
- Today it also works on ready notes, and each retry pays again for drafting, embeddings and a podcast.

### 4. Rate limits that can't be raced (S3)

- These limits read the count first and insert afterwards. So N requests sent at once all see "under the limit".
  - Assistant: `app/api/assistant/route.ts:51-56`.
  - Space chat: `app/api/space/chat/route.ts:47-52`.
  - New notes: `space/actions.ts`.
- Reserve the slot in one `db.batch` (a transaction):
  1. Take `pg_advisory_xact_lock(hashtext('ai:' || user_id))`.
  2. Count.
  3. Insert the turn or note only if under the limit.
- Create the chat thread only after the check passes. Today `ensureThread` runs before it.

### 5. Discussion posting limit (S12)

- At most 10 new threads and 30 replies per person per hour, using the same locked pattern.
- The code is in `app/(student)/(sidebar)/discussions/actions.ts`, which every discussion UI shares.

## Decisions needed

1. **Approve the scope change.**
2. **The limits.** Suggested starting values:
   - Students: 150 AI calls and $0.25 a day.
   - Staff: 1,000 calls and $3 a day.

   A typical student uses about 3 questions and a few calls a day.

## Acceptance criteria

- [ ] With the limit set low, each of these is refused with the reset time: the next assistant question, space question, new note, retry, podcast and regenerate. `ai_usage` shows no new calls for them.
- [ ] 30 parallel assistant requests from one student give exactly 20 answers, the 5-minute limit. Verified with a scratchpad script.
- [ ] A 3-hour audio file is rejected before transcription, with no transcription row in `ai_usage`.
- [ ] Retrying a ready note is refused.
- [ ] 11 threads in an hour: the 11th is refused.
- [ ] `project-overview.md` and `architecture.md` (invariant 9) describe the daily limit.
- [ ] Unit tests for `checkBudget` and the limits. `npm run build`, lint and tests pass.
