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
   `iad1` (Washington, D.C.), next to Neon. Set these environment
   variables for Production. `example.env` explains each one.
   - `DATABASE_URL`, `DATABASE_URL_POOLED` (the `demo` branch)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
     `CLERK_WEBHOOK_SIGNING_SECRET`
   - `BLOB_READ_WRITE_TOKEN`: connect the Blob store to the project and
     Vercel sets it.
   - `TRIGGER_SECRET_KEY`: the **prod** key. Also `TRIGGER_PROJECT_REF`.
   - `OPENROUTER_API_KEY`, `ASSISTANT_MIN_SIMILARITY`,
     `VIDEO_MAX_MINUTES`
   - `DEMO_MODE=true` and `DEMO_ACCOUNT_PASSWORD`, **only on this demo
     project**. Any other deployment must have `DEMO_MODE=false`: the
     one-click picker signs anyone in as the admin.
   - `NEXT_PUBLIC_APP_URL`: the deployment's URL.
3. **Blob store:** in the same region as Neon (Washington, D.C. /
   `iad1`). A Blob store's region is fixed when it's created, so check it
   before connecting.
4. **Trigger.dev:** `npm run trigger:deploy`. In the Trigger.dev dashboard
   (Production → Environment variables) set `DATABASE_URL`,
   `DATABASE_URL_POOLED`, `BLOB_READ_WRITE_TOKEN`, `OPENROUTER_API_KEY` and
   `VIDEO_MAX_MINUTES`. Check that the `notify-due-soon` schedule shows
   under Schedules.
5. **Clerk:** the development instance works on the Vercel URL (it shows a
   small "Development mode" badge). Add the webhook endpoint
   `https://<deployment>/api/webhooks/clerk` (`user.created`,
   `user.updated`, `user.deleted`).
6. **Check it:** `E2E_BASE_URL=https://<deployment> npm run e2e` after a
   `demo:reset`. All steps should pass. Add `E2E_UPLOAD=1` to include the
   live upload, and `E2E_ASSERT_LCP=1` to enforce the 2.5 s lesson page.

## Before the demo

**The day before**
- Run the end-to-end suite against the deployment (step 6 above), then
  `npm run demo:reset`, which puts the seeded state back.
- Check the OpenRouter credit (openrouter.ai → Credits): $2 is plenty for
  a month of rehearsals.
- Have the 2-minute backup clip on the laptop (see Backup plans). It must
  be MP4, H.264/AAC.

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
and **Continue as Student** buttons switch accounts in one click. Use
**Switch demo account** in the user menu to go back to them.

### 1 · The instructor's view (Admin)
- Click **Continue as Admin**. The Overview opens.
- *"This is Prof. Meera Rao's dashboard: who's active this week, how far
  students are, and what's waiting for her."* Point at **Waiting for
  grading** (Butter) and **Unanswered questions**.
- *"Aanya's problem set is waiting, and there's a question from her
  about span."*

### 2 · Upload a lecture (Admin)
- **Courses → MATH 201**. On the Curriculum tab, find **Diagonalisation**
  and click **Upload video**.
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
  **Messages** → the question from step 6 → reply, with "Mark my reply as
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

## After the demo

- `npm run demo:reset`, so the next run starts clean.
- A lecture uploaded live stays on **Diagonalisation**. Keep it for
  questions, or unpublish the lesson.
