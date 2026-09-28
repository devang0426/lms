# Feature 03: Demo accounts and seed

**Status:** Done (2026-09-25). Two items need a browser check: the one-click sign-in and the account switch.
**Depends on:** 02
**Demo step:** 1, 4 (switching between admin and student)

## Goal

With one command, set up a demo-ready database, and let the presenter
switch between the **Demo Admin** and the **Demo Student** in one click
from the sign-in page.

## Scope

**In:**
- An idempotent seed script: Clerk users plus Neon rows.
- A one-click demo account picker behind `DEMO_MODE`.
- A "Switch account" item in the user menu.

**Out:**
- Course content. Features 07, 12 and 20 add to the seed.

## Demo accounts

| Key | Name | Email | Role | Extra |
| --- | ---- | ----- | ---- | ----- |
| `admin` | Prof. Meera Rao | `demo.admin+clerk_test@example.com` | `admin` | Instructor (`course_staff`) of the demo course, once feature 07 exists |
| `student` | Aanya Sharma | `demo.student+clerk_test@example.com` | `student` | Enrolled in the demo course, once feature 07 exists |

- `+clerk_test` addresses skip email verification on Clerk development
  instances.
- The password for both comes from `DEMO_ACCOUNT_PASSWORD`.

## Files

- `scripts/seed.ts`, run with `npm run db:seed`:
  - Create each demo user through the Clerk Backend API, or find it by
    email if it already exists.
  - Set `publicMetadata.role` and the password.
  - Upsert the matching Neon `users` row.
  - Upsert the current term, "Autumn 2026".
  - Leave clearly marked sections that later features fill in:
    `seedCourse()` (07), `seedLecture()` (12), `seedAssignment()` (20).
- `scripts/reset-demo.ts`, run with `npm run demo:reset`:
  - Delete the demo student's activity: progress, reviews, attempts,
    chats, submissions and private notes.
  - Keep the course content, so the demo can be rehearsed and then run
    fresh.
- `lib/demo.ts`, `server-only`:
  - `DEMO_ACCOUNTS`: key, label, role description and email.
  - `isDemoMode()`.
- `app/(auth)/sign-in/demo-actions.ts`: server action
  `startDemoSession(key)`.
  1. Check `isDemoMode()`.
  2. Look up the Clerk user.
  3. Call `clerkClient.signInTokens.createSignInToken({ userId, expiresInSeconds: 60 })`.
  4. Return the token.
- `components/auth/demo-account-picker.tsx`, a client component:
  - Two cards: "Continue as Admin / Instructor" and "Continue as Student".
    Each shows the account's name and what it can show.
  - On click, it calls the action and then
    `signIn.create({ strategy: "ticket", ticket })`, then `setActive`, then
    routes to `/`.
  - If a session is already active, it signs out first.
- The sign-in page shows the picker above the normal Clerk form when
  `DEMO_MODE=true`.
- User menu: when `DEMO_MODE=true`, a "Switch demo account" item signs out
  and returns to the picker.
- Add `DEMO_ACCOUNT_PASSWORD` to `example.env`.

## Implementation notes

- The seed is **idempotent**. Running it twice changes nothing and creates
  no duplicates.
- `startDemoSession` must refuse, with a 404, when `DEMO_MODE` isn't
  `"true"`. It must never be reachable in a real rollout.
- The picker uses the Sign in wireframe:
  - Clay-tint hero on the left.
  - The picker cards on the right, above the email form, split by the
    "or with email" divider.
- **Landing routes after sign-in:**
  - admin: `/instructor` (the dashboard)
  - student: `/` (Student home)
  - Until feature 06 exists, both go to a placeholder that shows the name
    and role.

## Acceptance criteria

- [x] `npm run db:seed` creates both Clerk users and Neon rows plus the
      current term. A second run created no duplicates (verified).
- [x] With `DEMO_MODE=true`, `/sign-in` **and** `/sign-up` show both demo
      cards with **email and password visible** and a one-click button
      (verified in the rendered HTML). Clerk issues sign-in tokens for the
      demo users (verified from the backend). The click itself needs a
      browser test.
- [ ] "Switch demo account" moves between admin and student in under 5
      seconds. It's in the user menu on `/`; needs a browser test.
- [x] With `DEMO_MODE=false`, the picker isn't rendered and the credentials
      never reach the page. `startDemoSession` returns
      `{ ok: false, "Not found." }` (server actions can't return an HTTP
      404).
- [x] `npm run demo:reset` runs. It refuses unless `DEMO_MODE=true`.
      It signs out all open demo sessions and restores both accounts'
      role, name and password.
      There's no student activity yet, so it clears nothing else. Features
      11, 14, 15, 16, 19, 20 and 21 must each add a step to `RESET_STEPS`
      in `scripts/reset-demo.ts`.
- [x] `npm run build` passes, and lint is clean.

## As built

- **One click also covers sign-up:** `startDemoSession` creates the demo
  user in Clerk if it's missing, then issues a 60-second sign-in token. The
  client redeems it with Clerk v7's `signIn.ticket()` and then
  `signIn.finalize()`. So the button works even before `db:seed` has run.
  The Neon row then appears through lazy sync on the first page load.
- **Credentials are shown on the cards** (email and password,
  selectable), per the user's request. They're rendered by the server
  wrapper `app/(auth)/demo-picker-slot.tsx` only when `DEMO_MODE=true`.
- **Files:**
  - `lib/demo/accounts.ts`: accounts, `isDemoMode`, and
    `ensureDemoClerkUser`, which is idempotent and keeps the role.
  - `app/(auth)/demo-actions.ts`: the server action.
  - `components/auth/demo-account-picker.tsx`: the cards.
  - `components/auth/user-menu.tsx`: Clerk `UserButton` with a "Switch
    demo account" action.
  - `scripts/seed.ts`.
- **`npm run db:seed`** runs
  `node --env-file=.env.local --conditions=react-server --import tsx`. The
  `react-server` condition lets scripts import `server-only` modules.
- **Names in Neon:** "Meera Rao" and "Aanya Sharma". The "Prof." title is
  added only on the demo card.
- **`@clerk/backend`** is now a direct dependency, used by the seed
  script.
