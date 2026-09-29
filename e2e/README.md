# End-to-end tests

Playwright tests for feature 23:

- `demo.spec.ts`: the nine steps of the demo script, in order.
- `a11y.spec.ts`: axe checks (WCAG 2.2 AA; serious and critical issues
  fail the test) and keyboard passes on the player, flashcards, quiz and
  assistant.
- `mobile.spec.ts`: Student home, the lesson player and the assistant at
  390px, with no sideways scrolling.
- `perf.spec.ts`: the lesson page's LCP.

Every test also fails on a CSP violation, an uncaught error or a
hydration mismatch in the browser console.

## Running

```sh
npm run demo:reset          # the steps expect the seeded state
npm run build && npm run e2e   # local production build on :3100
E2E_BASE_URL=https://… npm run e2e   # against a deployment
npm run e2e:report          # open the last HTML report
```

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
