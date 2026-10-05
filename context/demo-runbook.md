# Demo runbook

For whoever runs the Studyhall demo. It follows the demo script in
`project-overview.md`, click by click, with what to say. Allow about 20
minutes, and a few more for questions.

## One-time setup (the demo deployment)

Do this once, and again only if something below changes.

1. **Database:** a Neon branch called `demo`, made from the dev branch
   (same region, us-east-2). Apply migrations to it (`npm run db:migrate`
   with its direct URL), then `npm run db:seed` with its URLs.
2. **Vercel project** from the GitHub repo, with the function region
   `iad1` (Washington, D.C.), next to Neon. Node comes from
   `package.json` (`engines.node: 22.x`), whatever the dashboard says.
   Don't drop that field: on Node 20 every page that renders Markdown
   fails (jsdom needs `require()` of ES modules). Set these environment
   variables for Production. `example.env` explains each one.
   - `DATABASE_URL`, `DATABASE_URL_POOLED` (the `demo` branch)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
     `CLERK_WEBHOOK_SIGNING_SECRET`
   - `BLOB_READ_WRITE_TOKEN`: connect the Blob store to the project and
     Vercel sets it. Also `BLOB_PUBLIC_HOST`: the store's host, e.g.
     `abc123.public.blob.vercel-storage.com` (`example.env` shows how to
     read it from the token). The CSP allows only this store, and the app
     won't start if it doesn't match the token.
   - `TRIGGER_SECRET_KEY`: the **prod** key. Also `TRIGGER_PROJECT_REF`.
   - `OPENROUTER_API_KEY`, `ASSISTANT_MIN_SIMILARITY`,
     `VIDEO_MAX_MINUTES`
   - `DEMO_MODE=true`, `DEMO_ACCOUNT_PASSWORD` and `DEMO_PASSCODE` (at
     least 8 characters), **only on this demo project**. Any other
     deployment must have `DEMO_MODE=false`: the one-click picker signs
     anyone in as the admin.
     - On a production deployment the app refuses to start with demo mode
       on and no passcode.
     - The sign-in page asks for the passcode before the picker works,
       and hides the demo password. Give the passcode only to people
       running or watching the demo.
     - While demo mode is on, role changes, invitations and roster Import
       are turned off.
     - For easy sign-in instead, set `DEMO_PUBLIC=true` (the owner's
       choice for the current deployment, 2026-09-30). There's no
       passcode then: the picker shows the demo email and password and
       signs in with one click, for anyone with the link. The landing
       page's "Try the demo" is built with it, so redeploy after changing it.
   - `NEXT_PUBLIC_APP_URL`: the deployment's URL. Invitation links are
     built from it, and so are the landing page's share image, sitemap
     and `robots.txt`.
   - The institute on the public landing page (feature 34):
     `INSTITUTE_NAME` (required), `INSTITUTE_TAGLINE`, and
     `INSTITUTE_EMAIL` and/or `INSTITUTE_PHONE` (one is required),
     plus `INSTITUTE_ADDRESS` if wanted.
     - The landing page, privacy and terms are built with these values,
       so set them before the build, and redeploy after changing them.
     - "Try the demo" also follows `DEMO_MODE` as it was at build time.
   - The app checks all of these when it starts (`lib/env.ts`). If one is
     missing or malformed, the Vercel function logs say which, and every
     page fails until it's fixed.
3. **Blob store:** in the same region as Neon (Washington, D.C. /
   `iad1`). A Blob store's region is fixed when it's created, so check it
   before connecting.
4. **Trigger.dev:** `npm run trigger:deploy`. In the Trigger.dev dashboard
   (Production → Environment variables) set `DATABASE_URL`,
   `DATABASE_URL_POOLED`, `BLOB_READ_WRITE_TOKEN`, `OPENROUTER_API_KEY`,
   `VIDEO_MAX_MINUTES` and `NEXT_PUBLIC_APP_URL` (the deployment's URL,
   for the links in a data export, feature 33), all with the same values
   as Vercel. Also `DEMO_MODE`, the same as Vercel: the daily
   `prune-old-rows` erases accounts deleted in Clerk, and skips the demo
   accounts only when it sees `DEMO_MODE=true`. `DOCUMENT_MAX_MINUTES` is
   optional (default 90). Don't set `FFMPEG_PATH`/`FFPROBE_PATH` (the
   image has ffmpeg) or `TRIGGER_SECRET_KEY` (Trigger.dev provides it).
   Then put the **prod** secret key (API keys → Production, `tr_prod_…`)
   in Vercel's `TRIGGER_SECRET_KEY` and redeploy Vercel: with the dev key,
   jobs go to the dev environment. Check that the `notify-due-soon` and
   `prune-old-rows` schedules show under Schedules.
5. **Clerk:** the development instance works on the Vercel URL (it shows a
   small "Development mode" badge). Add the webhook endpoint
   `https://<deployment>/api/webhooks/clerk` (`user.created`,
   `user.updated`, `user.deleted`). Under **Sessions → Customize session
   token**, add `{"metadata": "{{user.public_metadata}}"}`. Without it, a
   role changed in Clerk takes up to 10 minutes to apply, and the server
   log warns about it.
6. **Check it:** after a `demo:reset`, enter the passcode on the sign-in
   page and walk the script below once as each account. The Playwright
   suite can't sign in behind the passcode; run it locally instead (see
   `e2e/README.md`).
7. **Reset allowlist:** in the `.env` you run `demo:reset` with, set
   `DEMO_DB_HOSTS` to the `demo` branch's host (the direct one also covers
   its `-pooler` twin). The reset refuses any other database.

## Before the demo

**The day before**
- Walk the script once on the deployment (step 6 above), then
  `npm run demo:reset`, which puts the seeded state back.
- Check the OpenRouter credit (openrouter.ai → Credits): $2 is plenty for
  a month of rehearsals.
- Check the daily AI limit (feature 25). `demo:reset` doesn't clear it:
  it counts the last 24 hours of `ai_usage`. One full rehearsal uses
  about 45 of Aanya's 150 calls: a podcast is ~14 calls, a question 1–2,
  a private note 10–15. The Admin's regenerates and podcasts count against
  the staff limit (1,000). On `/admin/users`, "AI today" shows where each
  account stands. If Aanya will pass ~100 before the demo, set
  `AI_DAILY_CALLS_STUDENT` higher on the deployment for the day, then
  redeploy.
- Have the 2-minute backup clip on the laptop (see Backup plans). It must
  be MP4, H.264/AAC.
- Once, after feature 27: run `npm run db:seed` with the `demo` branch's
  env. It puts the three placeholder video lessons that have no video
  ("What is a vector?", "Matrix multiplication", "Inverses and
  determinants") back to draft, with the emptied Matrices module. Students
  then see only lessons that work.
- Once, after feature 30: `npm run db:migrate` with the `demo` branch's
  env (migration 0019: the "Drafts ready" notice and two indexes), then
  `npm run trigger:deploy` (the drafts notice in `video-process` and the
  daily `prune-old-rows`). Until the migration is applied, an upload's
  last step can't write its notice; the drafts themselves are unaffected.
- Once, after feature 33: `npm run db:migrate` with the `demo` branch's
  env (migration 0020: `data_exports`, `users.erased_at`, delete rules on
  the user foreign keys), then `npm run trigger:deploy` (the new
  `export-user-data` and `erase-user` tasks, and `prune-old-rows`).
  - Until then, the Profile page's "Your data" card and the admin's
    Delete user fail.
  - In demo mode the demo accounts can't be deleted. Any other account
    can, by whoever is the admin, so keep real accounts off a demo
    deployment.
- A server error's line in the Vercel logs (Functions → Logs) is JSON
  with `"level":"error"`. Search it for the Ref an error page shows (the
  `digest`) or the `ref` in an action's "Something went wrong" message.

**30 minutes before**
1. `npm run demo:reset` with the `demo` branch's env. It signs out every
   demo session, restores both accounts, clears the student's activity and
   puts back the ungraded submission and the open question.
2. Warm the pages: open the deployment and sign in as each account. Open
   `/instructor`, the lecture "Linear combinations and span" in the player,
   and its Ask tab. The first request after idle wakes the database (1–2
   s); the second is fast.
3. Sign out ("Switch demo account"), and leave the sign-in page open.
4. Close other tabs, set the browser zoom to 100%, and turn notifications
   off.

## The script

Lines to say are in *italics*. The sign-in page's **Continue as Admin**
and **Continue as Student** buttons switch accounts in one click, after
you type the demo passcode once into **Demo passcode**. Use **Switch demo
account** in the user menu to go back to them.

### 1 · The instructor's view (Admin)
- Click **Continue as Admin**. The Overview opens.
- *"This is Prof. Meera Rao's dashboard: who's active this week, how far
  students are, and what's waiting for her."* Point at **Waiting for
  grading** (Butter) and **Unanswered questions**.
- *"Aanya's problem set is waiting, and there's a question from her
  about span."*

### 2 · Upload a lecture (Admin)
- **Courses → MATH 201**. On the Curriculum tab, find **Diagonalisation**
  and click its **Upload video** button. (A brand-new lecture goes in
  with **Upload lecture** on a module: pick the MP4, keep the title filled
  in from the file name, **Upload**. That adds a lesson, which
  `demo:reset` doesn't remove, so keep the demo on Diagonalisation.)
- Drop the lecture MP4. *"The file goes straight from the browser to
  storage, then a background job takes over: I could close this tab."*
- Point at the stages as they tick: checking the file, preparing for
  streaming, poster, audio, **transcribing**, captions, then chapters,
  notes, flashcards and quiz.
- A 20-minute lecture takes about as long as the video, so don't wait:
  *"While that runs, here's one we prepared earlier."*

### 3 · Review the draft (Admin)
- Go back to the curriculum, open **Linear combinations and span**, then
  **Review and publish**.
- **Chapters:** *"The AI found the topic changes, with times."*
- **Notes:** *"One section per chapter, and each heading keeps its video
  time."*
- **Flashcards:** change a word on the first card and press **Save**.
  *"The instructor stays in charge: nothing reaches students until it's
  published."* Press **Publish changes** if it shows (a published lesson
  whose items are all live reads **Published**).

### 4 · The student's home (Student)
- User menu → **Switch demo account** → **Continue as Student**.
- *"Aanya's home: pick up where she left off, what's coming up (her
  problem set's due date), and her courses."*

### 5 · The lesson player (Student)
- **My courses → Linear Algebra → Linear combinations and span.**
- *"Captions are on. The chapters sit on the scrubber, and the
  transcript follows along."* Click a transcript line: the video jumps
  there.
- **My notes:** type a note. *"It's pinned to the moment she started
  typing."*

### 6 · Ask the assistant (Student)
- **Ask** tab. Ask: **"Explain what a linear combination is"**.
- *"It answers only from this course, and every claim is cited."* Click
  a citation chip: the video jumps to that moment.
- Try the chips' other mode: type **"What is the span of two vectors?"**
  and press **Where was this taught?** Three moments come back.
- Ask: **"What's the capital of France?"** *"Off the syllabus, so it
  refuses, without even calling the AI. And it offers to ask the
  instructor."* Click **Ask your instructor**; the question is already
  filled in. Post it.

### 7 · Study (Student)
- **Flashcards:** press Space to flip, then **Good**. *"Spaced
  repetition: this card comes back in a couple of days."*
- **Quiz:** **Start practice** and answer two questions. *"Instant
  feedback, with a link back to the moment in the video."*
- **Podcast:** **Generate podcast (short)** takes about 30 seconds.
  *"Two voices talking through the notes; there's a Hindi–English version
  too."* If one was made in rehearsal, just press play.

### 8 · My space (Student)
- **My space → New note**, and drop a PDF (any short handout).
- *"Her own material, private to her: notes, flashcards, a quiz and a
  chat."* Once it's ready (about 2 minutes), open **Chat**, turn on
  **Include my courses**, and ask something the PDF covers.

### 9 · Grading (Admin, then Student)
- Switch to the Admin. **Grading** → Aanya's problem set. Give **8.5**,
  write a line of feedback, then **Save and next**.
- *"While she was at it, Prof. Rao also answers Aanya's question."*
  **Questions** → the question from step 6 → reply, with "Mark my reply as
  the answer" ticked.
- Switch to the Student. *"Aanya has two notifications"* (the bell): her
  grade and the reply. Open them.

## Backup plans

- **The live upload is slow or fails:** don't wait on it. Carry on from
  step 3 with the prepared lecture. If there's time at the end, upload the
  2-minute backup clip to **Diagonalisation** and show it reach
  "Transcribing" and then the drafts.
- **The assistant refuses an on-syllabus question:** free models
  sometimes return an empty answer, and that shows as a refusal. Ask again
  (the same words are fine), or use "What is a vector?".
- **The video doesn't start:** reload the page. The lecture streams from
  Blob, so a slow network shows as a slow start.
- **The podcast takes longer than a minute:** move on and come back to it.
- **Something is in a strange state:** `npm run demo:reset`, then sign in
  again. The reset takes about 30 seconds.
- **"You've reached today's AI limit":** the demo student used her daily
  AI calls in rehearsal. Raise `AI_DAILY_CALLS_STUDENT` on the deployment
  and redeploy, or carry on with steps that don't call the AI (flashcards,
  the quiz, grading).

## After the demo

- `npm run demo:reset`, so the next run starts clean.
- A lecture uploaded live stays on **Diagonalisation**. Keep it for
  questions, or unpublish the lesson.
