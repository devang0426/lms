# Feature 23: Hardening and demo polish

**Status:** Not started
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

- [ ] Playwright passes all 9 demo steps against the deployed URL.
- [ ] Two rehearsals in a row with `demo:reset` in between go with no
      manual fixes.
- [ ] Monthly running cost at demo usage is logged in
      `progress-tracker.md`: free tiers plus the OpenRouter spend from
      `ai_usage`.
- [ ] `npm run build` passes in CI.
