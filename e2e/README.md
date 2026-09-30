# End-to-end tests

Playwright tests for feature 23:

- `demo.spec.ts`: the nine steps of the demo script, in order.
- `a11y.spec.ts`: axe checks (WCAG 2.2 AA; serious and critical issues
  fail the test) and keyboard passes on the player, flashcards, quiz and
  assistant.
- `mobile.spec.ts`: Student home, the lesson player and the assistant at
  390px, with no sideways scrolling.
- `perf.spec.ts`: the lesson page's LCP.
- `landing.spec.ts` (feature 34, project `landing`), signed out:
  - `/` shows the landing page; signed in, `/welcome` leads home.
  - "Try the demo" signs in from its dialog.
  - A deep link goes to sign-in and back; lessons and the assistant stay
    closed.
  - The course list has no links, and robots.txt, the sitemap and the
    share tags are in place.
  - Privacy and terms, axe, 390px, and LCP under 1.5 s (enforced).
- `builder.spec.ts` (feature 27, project `builder`):
  - "Upload lecture" gets an upload running within 4 clicks of the course
    page, from a `.mp4` the browser gives no type.
  - A new lesson opens its editor, Quiz isn't offered, and Change type
    works only on an empty lesson.
  - A video lesson without a video can't be published.
  - The review screen's breadcrumb, with axe on the builder, the dialog
    and the review screen.
  - Each test adds a module to MATH 201 and deletes it in a `finally`.
  - Without `E2E_UPLOAD` the Blob requests are held, so no bytes are
    sent. With it, the real clip uploads and the test waits for the
    lesson editor.

Every test also fails on a CSP violation, an uncaught error or a
hydration mismatch in the browser console.

## Running

```sh
npm run demo:reset          # the steps expect the seeded state
npm run build && npm run e2e   # local production build on :3100
E2E_BASE_URL=https://… npm run e2e   # against a deployment without a demo passcode
npm run e2e:report          # open the last HTML report
```

The tests sign in through the demo picker, so they can't run against a
server with `DEMO_PASSCODE` set (every production deployment with demo
mode on, feature 24). They aren't part of CI.

They use installed Google Chrome (the lecture is H.264, which Playwright's
own Chromium can't play). Set `E2E_CHANNEL` to use another browser channel.

| Variable | Effect |
| --- | --- |
| `E2E_UPLOAD=1` | Run steps 2 and 8, which upload a 20-second lecture clip and a PDF. Needs the Trigger.dev worker (`npm run dev:all` locally, or the prod deploy). Costs a fraction of a cent. |
| `E2E_FULL_PIPELINE=1` | With `E2E_UPLOAD`, also wait for the drafts and the private note to finish (up to ~20 min). |
| `E2E_PODCAST=1` | Press "Generate podcast" in step 7 when no episode exists (~1¢). |
| `E2E_ASSERT_LCP=1` | Fail when the lesson page's LCP is over 2.5 s. Meant for the deployment, where the app and the database share a region. |
A run changes the demo data like a rehearsal would: it grades the seeded
submission, posts a question, adds a note, rates a card and saves a quiz
attempt. `npm run demo:reset` puts it all back. Step 3 edits a flashcard
and restores it.

Test files (a PDF, and with `E2E_UPLOAD` a clip cut from the demo lecture)
are made in `e2e/.cache/` on the first run. Results go to `e2e/.results/`
and the report to `e2e/.report/`. All three are git-ignored.
