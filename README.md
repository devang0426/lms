# Studyhall

A learning management system for one university. Instructors upload
lecture videos and course material, and the app drafts a transcript,
chapters, notes, flashcards and a quiz from each lecture. Students watch,
study and ask a course assistant that answers only from the course,
citing the exact moment in the lecture (clicking a citation jumps the
video there). It refuses questions outside the syllabus.

## Features

- **Video lectures:** MP4 upload straight from the browser, then
  background processing into a transcript, captions, chapters and a
  poster. The player has a following transcript, chapter markers,
  timestamped personal notes and resume.
- **AI drafts, instructor-approved:** notes, flashcards and quizzes from
  each lecture or reading, reviewed and published by the instructor.
- **Course assistant:** grounded answers with lecture-time or page
  citations, "Where was this taught?", and off-syllabus refusal without a
  model call.
- **Study tools:** spaced-repetition flashcards (FSRS), practice and
  graded quizzes with mastery per topic, and an on-demand two-voice
  podcast (English or Hindi–English).
- **Documents:** PDF, Word, web pages, recordings and YouTube, turned into
  citable sources.
- **Private space:** students upload their own material for private
  notes, cards, quizzes, chat and podcasts that nobody else can see.
- **Coursework:** assignments, file hand-in, a grading queue with
  feedback, and a gradebook with CSV export.
- **Communication:** calendar, announcements, course discussions
  ("Ask your instructor") and in-app notifications.
- **Admin:** instructor dashboard and analytics (watch heat-strips,
  most-asked topics, AI cost), users and roles, CSV roster import with
  invitations, terms, and an audit log.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Auth | Clerk (roles in public metadata; one-click demo accounts) |
| Database | Neon Postgres + Drizzle ORM, pgvector for retrieval |
| Files and video | Vercel Blob (plain MP4, no transcoding) |
| Background jobs | Trigger.dev v4 (ffmpeg, transcription, drafting, indexing) |
| AI | OpenRouter: free models first, cheap paid fallbacks, Whisper, Kokoro TTS, embeddings |
| Tests | Vitest (unit), Playwright + axe (end-to-end, accessibility) |

## Getting started

### You'll need

- Node.js 22 and npm.
- Accounts (all have free tiers): Neon, Clerk, Vercel (for Blob),
  Trigger.dev and OpenRouter.
- Google Chrome, for the end-to-end tests.

### Set up

```sh
npm install
cp example.env .env.local     # then fill in the values; each is explained in the file
npm run db:migrate            # create the tables (the first migration enables pgvector)
npm run db:seed               # demo accounts, the demo course, a processed lecture, an assignment
```

### Run

```sh
npm run dev:all               # Next.js on :3000 and the Trigger.dev dev worker
```

Run it in a normal terminal: the Trigger.dev worker needs an interactive
shell. `npm run dev` starts only the web app. Pages work, but uploads,
drafting and podcasts wait for the worker.

Open http://localhost:3000/sign-in. With `DEMO_MODE=true`, the page lists
two demo accounts (Prof. Meera Rao, admin and instructor; Aanya Sharma,
student) with one-click sign-in.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `dev:all` | The web app / the web app plus the Trigger.dev worker |
| `npm run build` / `start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright: the demo script, accessibility, phone layouts, LCP (see `e2e/README.md`) |
| `npm run check:secrets` | After a build: fails if any server secret is in the browser bundle |
| `npm run db:generate` / `db:migrate` | Create a migration from `lib/db/schema.ts` / apply migrations |
| `npm run db:seed` | Seed the demo data (safe to run again) |
| `npm run demo:reset` | Restore the demo to its starting state; signs out demo sessions |
| `npm run trigger:deploy` | Deploy the background tasks to Trigger.dev |
| `npm run eval:retrieval` | Score the assistant's retrieval on the seeded lecture |
| `npm run smoke:ai` | Check the OpenRouter key with one tiny call |

## Tests

```sh
npm test                      # unit tests
npm run build && npm run e2e  # end-to-end, against a local production build on :3100
E2E_BASE_URL=https://… npm run e2e   # against a deployment
```

Run `npm run demo:reset` before the end-to-end suite: it walks through the
demo and expects the seeded state. The options (live uploads, podcast
generation, LCP budget) are in `e2e/README.md`.

There's no CI. Vercel builds and deploys each push to `main`. Before
pushing, run `npm run lint`, `npm test`, `npm run build` and
`npm run check:secrets` locally.

## Project layout

```
app/          routes: pages, layouts, server actions next to their route, API routes
components/   ui/ primitives, and one folder per feature (player, assistant, study, …)
lib/          server-only data access (db/), auth, AI (ai/), storage, and pure logic with tests
trigger/      Trigger.dev tasks (video processing, drafting, indexing, podcasts, due-soon)
drizzle/      SQL migrations
scripts/      seed, demo reset, evaluation, secret check
e2e/          Playwright tests
context/      product, architecture and standards docs, feature specs, progress tracker
```

## Security

- Access is checked inside every query: enrollment, course staff, or
  ownership for private material. `proxy.ts` only redirects signed-out
  visitors.
- Secrets stay on the server (`lib/ai`, `lib/db`, `lib/auth` and
  `lib/storage` are server-only), and `npm run check:secrets` checks the
  browser bundle after a build.
- Uploads go straight from the browser to Blob with per-kind type and size
  rules, and a per-person hourly limit.
- Web pages are fetched only through an SSRF guard. Everything people
  write is sanitized, and posts are rendered without raw HTML.
- Security headers and a Content Security Policy are set in
  `next.config.ts`.
- `DEMO_MODE` must be `false` everywhere except the demo deployment: the
  demo picker signs anyone in as the admin.

## Documentation

- `context/project-overview.md`: what the product is, the demo script,
  and success criteria.
- `context/architecture.md`: system design, storage model and invariants.
- `context/code-standards.md` and `context/ui-context.md`: how code and
  UI are written.
- `context/features/`: one spec per feature (01–23).
- `context/progress-tracker.md`: what's done, open questions and
  decisions.
- `context/demo-runbook.md`: deploying the demo and running it,
  click by click.

## Deployment

The demo runs on Vercel (web app), Neon (a `demo` branch), Vercel Blob
and Trigger.dev. The one-time setup, including the environment variables
for Vercel and Trigger.dev, is in `context/demo-runbook.md`.

## Running cost

Everything except AI fits the services' free tiers at demo usage. AI is
pay-as-you-go through OpenRouter and logged per feature in the `ai_usage`
table. A full lecture costs a few cents to draft, and a month of demo
rehearsals about $1–2.
