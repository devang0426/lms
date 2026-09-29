# Feature 23: Hardening and demo polish

**Status:** In progress (2026-09-29). Everything that runs locally is
done and verified. The deployment, the run against the deployed URL, the
two rehearsals and CI on GitHub are still to do (see "As built" below).
**Depends on:** all previous features
**Demo step:** all

## Goal

The demo runs flawlessly on the deployed app. The codebase is safe to show
to a university IT team.

## Scope

**In:**
- End-to-end tests.
- Security headers.
- Accessibility and mobile passes.
- Performance.
- Deployment.
- A demo runbook.

**Out:** full production rollout tasks (SSO, data protection work). Those
are tracked in `../progress-tracker.md`.

## Tasks

- **Playwright:** one test per demo script step (1–9), using the demo
  accounts through the ticket sign-in. It runs against a Neon branch seeded
  by `npm run db:seed`.
- **Security:**
  - CSP and security headers in `next.config.ts`. Allow Blob, Clerk and
    Trigger.dev hosts.
  - Check that no secret is in the client bundle (a grep in CI).
  - Rate limits on the assistant and on uploads.
  - `DEMO_MODE` must be `"false"` in any non-demo environment.
- **Accessibility:**
  - Keyboard pass on the player, flashcards, quiz and assistant.
  - Captions on by default for the demo lecture.
  - axe checks in Playwright.
- **Mobile:** Student home, the lesson player (stacked layout) and the
  assistant at 390px.
- **Performance:**
  - Lesson page LCP under 2.5 seconds on the deployed demo.
  - The transcript list is virtualized for long lectures.
- **Deploy:**
  - Vercel project with env vars.
  - A Neon `demo` branch.
  - Trigger.dev prod deploy.
  - Blob store region matched to the Neon region.
- **Demo runbook** (`context/demo-runbook.md`):
  - Before the demo: `npm run demo:reset`, warm the pages, check the
    OpenRouter key credit.
  - A click-by-click script with the lines to say.
  - The exact questions to ask the assistant, including the off-syllabus
    one.
  - A backup plan if live upload is slow: show the pre-processed lecture,
    and upload a 2-minute clip live instead.

## Acceptance criteria

- [ ] Playwright passes all 9 demo steps against the deployed URL. (They
      pass against a local production build: 7 steps run; 2 and 8 need
      `E2E_UPLOAD=1` and the Trigger.dev worker. Waits on the
      deployment.)
- [ ] Two rehearsals in a row with `demo:reset` in between go with no
      manual fixes. (Waits on the deployment; `demo:reset` signs out
      every demo session, so it's run with the owner's go-ahead.)
- [x] Monthly running cost at demo usage is logged in
      `progress-tracker.md`: free tiers plus the OpenRouter spend from
      `ai_usage`.
- [ ] `npm run build` passes in CI. (The workflow is in
      `.github/workflows/ci.yml`: lint, 339 unit tests, build and the
      secret check, all passing locally. It runs once the branch is pushed
      and the repository secrets are set.)

## As built

- **Playwright** (`e2e/`, `playwright.config.ts`; see `e2e/README.md`):
  - `demo.spec.ts` has one test per demo step. Signing in uses the
    picker's one-click ticket.
  - Steps 2 and 8 (uploads) run with `E2E_UPLOAD=1`. Their test files
    are made on the first run: a PDF, and a 20 s clip cut from the demo
    lecture in Blob, so no binaries are in git.
  - `a11y.spec.ts`: axe (WCAG 2.2 AA; serious and critical fail) on 15
    pages, plus keyboard tests.
  - `mobile.spec.ts` (390px) and `perf.spec.ts` (LCP).
  - Every test fails on a CSP violation, an uncaught error or a hydration
    mismatch.
  - It runs on installed Google Chrome: Playwright's Chromium can't play
    H.264.
- **Security:**
  - `next.config.ts` sends a CSP and the usual headers (HSTS, nosniff,
    `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP).
  - The CSP allowlist covers Clerk (the Frontend API host read from the
    publishable key, img, telemetry, Cloudflare's check), Blob (reads,
    and uploads through vercel.com) and Trigger.dev (api.trigger.dev).
  - Scripts keep `'unsafe-inline'`: the policy has no per-request nonce.
    That's the upgrade path, noted in the file.
  - `npm run check:secrets` scans `.next/static` for the real values of
    the server-only env vars and for the key shapes.
  - Upload rate limit: 30 uploads an hour for a student, 120 for staff.
    It's checked before a Blob token is issued, counted from `blob.upload`
    audit rows.
  - The assistant's limit (20 questions per 5 minutes) was already in
    place.
  - `DEMO_MODE=false` everywhere but the demo: in CI, in the runbook, and
    in `example.env`.
- **Accessibility:**
  - Captions are on by default (every lecture with captions, not only
    the demo's).
  - The player is a tab stop, and its keys are described for screen
    readers.
  - Quiz answers follow the ARIA radio-group pattern: one tab stop, the
    arrows move and select.
  - Maths renders with MathML for screen readers. The TeX annotation is
    kept, so it isn't read twice.
  - The calendar's other-month days now meet contrast.
- **Mobile:** home, the stacked player and the assistant have no sideways
  scrolling at 390px (tested).
- **Performance:** the transcript is virtualized from 400 lines (about 40
  minutes, with `@tanstack/react-virtual`). Shorter transcripts stay whole
  for find-in-page and screen readers.
  - The lesson page's LCP was 4.1 s from the laptop against us-east-2
    Neon. The 2.5 s target is checked on the deployment
    (`E2E_ASSERT_LCP=1`).
- **The 4 stale engine tests** now read their models from
  `OPENROUTER_DEFAULT_CHAINS`, so the suite is green (339/339) whatever
  the model order.
- **Runbook:** `context/demo-runbook.md` covers the one-time deployment
  setup, before the demo, the click-by-click script with lines and
  questions, backup plans, and after.
