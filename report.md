# Studyhall: Production Readiness Audit

**Date:** 29 September 2026
**Code audited:** `main` at commit `4aabfb5` (features 01–23). The audit was read-only: nothing in the code was changed.
**Covers:** security, reliability and operations, performance, navigation and usability, and a monthly cost estimate for 500 students.

Each finding has an ID (for example **V2** or **S1**) so you can refer to it. Priorities:

- **P0**: fix before anyone outside the team gets the URL.
- **P1**: fix before real students use it.
- **P2**: fix before a larger or university-wide rollout.

---

## 1. Summary

The foundation is solid. Every data read and write checks access inside the database query. The review found no case where one user could reach another user's data by changing an id. Inputs are validated, and security headers, CI and a Playwright suite are in place. Type-checking, lint and all **339 unit tests pass**.

It is **not production grade yet**, for four reasons:

1. **Demo mode is an admin backdoor.** Anyone with the URL can sign in as the admin (S1).
2. **Nothing caps AI spend.** Several paths let one student keep spending money (S2, S3, S5).
3. **Background failures leave screens stuck.** A failed video upload can lock a lesson for good (V2). Nothing reports errors to you (R1).
4. **The app is hard to find your way around and slow.** Adding a lecture takes seven steps with no guidance (V1). Pages take 2–3.5 s because of distance and one-at-a-time queries (section 7).

**Top items:**

| ID | Problem | Priority |
|---|---|---|
| S1 | Demo mode lets anyone sign in as admin | P0 |
| V2 | A video can stay "processing" forever, with no retry and no re-upload | P0 |
| S4 | Graded quizzes show the correct answers after the first attempt | P0 |
| S2 | No limit on AI spend per student | P0 |
| S5 | Students can upload unlimited files (free file hosting) | P0 |
| V1 | Teachers can't find how to add a video | P1 |
| 7 | Pages take 2–3.5 s | P1 |

**Cost:** a typical 500-student month costs about **$245–360 (about ₹22k–32k)** if videos move to Cloudflare R2. On the current design (videos on Vercel Blob) it is about **$470–665**. Details are in section 8.

---

## 2. How the audit was done

- Four code reviews ran in parallel: security, reliability and operations, performance, and navigation. I traced the teacher's video upload myself.
- I ran read-only database queries against the dev database: the audit log, video and job states, and the AI usage log.
- I measured database and network timings live from the development machine.
- I checked vendor pricing on the official pricing pages on 29 September 2026.
- I re-checked every P0 item in the code by hand.

---

## 3. The video upload problem

### V1. Teachers can't find where to add a video (P1)

**What happened:** on 28 Sep the demo teacher account made four moves, according to the audit log:

- `course.create` at 08:33: the "MATHS" course.
- `module.create` at 08:33.
- `module.delete` at 08:34.
- It then stopped.

No lesson was created and no upload was started. The teacher got lost before reaching the upload screen.

**Why:** the upload box exists only inside a lesson whose type is **Video**. The path is:

1. Courses
2. Open the course
3. Type a title into the "Add lesson" field at the bottom of a module
4. Keep the type as "Video"
5. Click a small grey **"Upload video"** link on the new row ([curriculum-editor.tsx:159](components/course-builder/curriculum-editor.tsx#L159))
6. The lesson page opens
7. Click "Choose a video"

Nothing on the dashboard or the course page points there:

- The dashboard offers only "Post announcement" and "New course".
- After "Add lesson", the page stays where it is ([actions.ts:235-259](app/%28instructor%29/instructor/courses/actions.ts#L235-L259)).
- The file rules (MP4 H.264/AAC, up to 2 GB, up to 60 minutes) only appear once you are inside a video lesson.

**Fix:**

- Add an **"Upload lecture"** button on each module header. It creates a video lesson and opens its uploader.
- After "Add lesson", go straight to the new lesson.
- Make "Upload video" a normal button, not a faint link.
- Show the file rules next to the lesson-type picker.
- Put an "Upload a lecture" action on the dashboard.

### V2. A video can stay "processing" forever (P0)

**Where:**

- [lib/video/lessons.ts:31-56](lib/video/lessons.ts#L31-L56)
- [trigger/lib/job-progress.ts:47](trigger/lib/job-progress.ts#L47)
- [lesson editor page.tsx:146](app/%28instructor%29/instructor/courses/%5BcourseId%5D/lessons/%5BlessonId%5D/page.tsx#L146)

**What goes wrong:** the video row and the lesson are set to "processing" before the background job is queued. Only the task's own step-failure path ever sets a video back to "failed". So the video stays "processing" for good in any of these cases:

- The Trigger.dev worker isn't running (locally, it only runs with `npm run dev:all`).
- The Trigger key is missing or wrong.
- Trigger.dev is down.
- The job crashes, runs out of memory or times out.

When that happens, the task's failure hook updates only the jobs table.

**What the teacher sees:**

- The job shows as failed.
- There is no Retry button, because Retry needs the video to be marked "failed".
- The upload box is hidden, because the video is "processing".
- Publish is disabled.

The only way out is deleting the lesson. Documents and private notes already recover from this case; videos don't.

**Fix:**

- Catch the error when queueing the job and mark the video failed.
- When the latest job has ended without completing, mark the video failed and restore the lesson status.
- Always show Retry and the uploader once a job has ended.

### V3. A job with no worker says "Queued" forever (P1)

**Where:** [lib/jobs/index.ts:28](lib/jobs/index.ts#L28) passes no `ttl`, and `lib/jobs/stages.ts` treats unknown statuses as queued.

**Fix:**

- Pass a `ttl` (for example 30 minutes) so an orphaned run expires and gets reconciled.
- After a few minutes in the queue, show: "Processing hasn't started. The background worker may be offline. Try again."

### V4. A video lesson can be published with no video (P1)

**Where:** [setLessonPublished, actions.ts:276](app/%28instructor%29/instructor/courses/actions.ts#L276) has no video check. The seed publishes three such lessons ([scripts/seed.ts:108](scripts/seed.ts#L108)):

- "What is a vector?"
- "Matrix multiplication"
- "Inverses and determinants"

Students see "The video isn't ready yet".

**Fix:** block publishing until a ready video exists, and fix the seed.

### V5. The "Quiz" lesson type does nothing, and a lesson's type can't be changed (P1)

**What happens:**

- A Quiz lesson's editor shows only a documents card.
- Students see "Its content arrives with a later update".
- No action changes a lesson's type. A lesson created as the wrong type has to be deleted and made again.
- The Documents card on non-video lessons says "upload the video or its audio instead", which is misleading.

**Fix:**

- Remove "Quiz" from the type list, or make it create a graded quiz.
- Allow "Change type" while a lesson is empty.

### V6. The MP4 check differs between browser and server (P2)

**What happens:** the browser accepts any file named `.mp4` ([video-uploader.tsx:16-21](components/video/video-uploader.tsx#L16-L21)). The server requires the browser-reported type to be exactly `video/mp4`. On some Windows machines a valid MP4 reports a different type and is refused with a confusing message.

**Fix:** the server should trust the extension here, because ffprobe checks the real codec later anyway.

---

## 4. Security and cost loopholes

### S1. Demo mode gives an admin login to anyone (P0)

**Where:**

- [app/(auth)/demo-actions.ts:14](app/%28auth%29/demo-actions.ts#L14)
- [lib/demo/accounts.ts:43-84](lib/demo/accounts.ts#L43-L84)
- `example.env:11` (`DEMO_MODE=true`)

**What happens:**

- `startDemoSession("admin")` is a server action that anyone can call without signing in.
- It returns a 60-second Clerk sign-in ticket for the admin account.
- If the admin account is missing, it creates it. If someone demoted it, it resets it to admin.
- The only gate is the `DEMO_MODE=true` environment variable, and the example env file ships with it on.

**Impact:**

- A visitor signs in as admin and promotes their own second account to admin. That access survives turning demo mode off.
- They can read every gradebook and the audit log.
- They can send Clerk invitation emails to any address, 500 rows per CSV.
- They can run AI jobs without limit.

**Fix:**

- Require a second condition as well, such as not the production environment, a host allowlist or a shared passcode. Refuse to start otherwise.
- Default `example.env` to `false`.
- Block role changes and invitations while in demo mode.
- Give the demo its own Clerk instance and database.

### S2. No limit on AI spend (P0)

**What happens:**

- **Sign-up is open.** Every new account becomes a student. The sign-up page says to set Clerk to "Restricted", but the code doesn't enforce it; the dashboard setting was not verified.
- **No length cap on audio or YouTube.** Only lesson videos have one. A 200 MB low-bitrate audio file or a 10-hour YouTube link is transcribed in full ([trigger/lib/transcribe.ts](trigger/lib/transcribe.ts), [trigger/lib/ingest-document.ts](trigger/lib/ingest-document.ts)).
- **"Retry" works on notes that already finished** ([lib/space/index.ts:82-89](lib/space/index.ts#L82-L89)). Each retry pays for drafting and embeddings again, and it also makes the note's podcast eligible to be regenerated.
- **No budget anywhere.** `ai_usage` only logs. The only ceiling is the OpenRouter key's limit.

**Fix:**

- Check a daily AI budget per student against `ai_usage` before starting any job or answer.
- Check audio and YouTube length first and reject anything over N minutes.
- Allow retry only on failed notes.
- Restrict sign-up (invite-only) in Clerk.

### S3. Rate limits can be beaten by sending requests in parallel (P1)

**Where:**

- [app/api/assistant/route.ts:51-56](app/api/assistant/route.ts#L51-L56)
- `app/api/space/chat/route.ts:47-52`
- The note limit in `app/(student)/(sidebar)/space/actions.ts`

**What happens:** each limit reads a count, then inserts a row later. Fifty requests sent at once all see "under 20" and all reach the AI model.

**Fix:** reserve the slot atomically, by inserting and counting in one statement or using an advisory lock.

### S4. Graded quizzes give away their answers (P0)

**Where:** [lib/db/quizzes.ts:224-272](lib/db/quizzes.ts#L224-L272)

**What happens:**

- Every submit returns the correct answers and explanations, and the best attempt counts. A student can submit attempt 1 blank, read the answers, then score 100% on attempt 2.
- An attempt started before the due date can be submitted any time afterwards.

**Fix:**

- Show correct answers only after the due date or once attempts run out.
- Enforce a submit deadline (due date plus a short grace period).

### S5. Students can upload unlimited files (P0)

**Where:**

- [lib/storage/blob.ts:130](lib/storage/blob.ts#L130): `ownsDocument` doesn't check that the note is waiting for a file.
- [lib/storage/blob.ts:70](lib/storage/blob.ts#L70): private uploads are de-duplicated by document id, so repeats aren't counted toward the hourly limit.

**What happens:** a student reuses the id of a note they already own and uploads as many 200 MB files as they like. The files are never counted, never attached and never deleted. Each one is a permanent public link on your storage, which makes it free file hosting.

**Fix:**

- Require the document's status to be `uploading`.
- Count uploads by file path.
- Clean up files that have no database record.

### Lower priority (P2)

| ID | Problem | Where | Fix |
|---|---|---|---|
| S6 | The Blob store is **public**: file links never expire, and a student who drops a course keeps working links | `lib/storage/blob.ts:17-22` | Move to a private store (or R2) with short-lived signed links through the existing `/documents` and `/submissions` routes |
| S7 | Assistant answers allow raw HTML with `style`. A poisoned web page added as course material could make the assistant draw a full-screen fake link over the page for every student (a phishing overlay). JavaScript still can't run | [lib/markdown.ts:299](lib/markdown.ts#L299) | Escape raw HTML in answers, as `renderPostMarkdown` already does. Allow `style` only on maths output. Wrap sources in clear delimiters in the prompt |
| S8 | The CSP allows every Vercel Blob store, not just yours | [next.config.ts:30](next.config.ts#L30) | Pin your store's exact host |
| S9 | Every instructor sees the university's total AI cost | `lib/db/analytics.ts:122-135` | Scope it to their courses, or show it to admins only |
| S10 | The invitation link is built from request headers | `lib/admin/links.ts:8-11` | Use a configured app URL |
| S11 | A deleted user can come back: a late "user updated" webhook clears the deleted flag | `lib/auth/sync.ts:52` | Never clear `deletedAt` from webhook updates |
| S12 | Discussions have no rate limit (spam, and each post sends notifications) | `lib/db/discussions.ts` | Per-user limit |
| S13 | `/dev/ui` and `/dev/tokens` ship to production (`/dev/jobs` is admin-only) | `app/dev/` | Return 404 for all `/dev` pages in production |

---

## 5. Navigation and usability

### N1. Adding a lecture is seven steps with no guidance (P1)

See V1.

### N2. Two "Publish" buttons do different things (P1)

- The Publish button on a curriculum row publishes **the lesson only**. Its notes, flashcards and quiz stay as drafts.
- The Publish button on the review page publishes the lesson **and** all its content.
- The course, the module and the lesson each need publishing separately.

**Fix:**

- Make the row button do the same as the review page, or send the teacher to the review page.
- Add a "Publish course and module too" shortcut to the draft banner.

### N3. Staff can't reach the student view (P1)

- There is no "View as student" link anywhere. The user menu only has "Switch demo account" and "Sign out".
- The student "Home" silently redirects an admin to `/instructor`.
- When a plain instructor previews a lesson, "Back to course" on the last lesson goes to `/courses/[id]`, which bounces them to `/instructor`.

**Fix:** add "View as student" to the staff sidebar and user menu, and point the preview's "Back to course" at the course builder.

### N4. The course page sends enrolled students the wrong way (P1)

- The top bar says "Back to Explore" even for enrolled students.
- "My learning" is hidden on small screens.
- The page doesn't link to the course's discussions, grades, flashcards or calendar.

**Fix:** use a breadcrumb (Home › My courses › MATH 201) and add quick links for the course.

### N5. Teacher tools are scattered (P1)

- The gradebook is only a faint header button.
- Calendar events are a tab inside the course builder.
- Graded quizzes only appear on video lessons that already have AI questions, so reading lessons can't have one.
- There is no student list for teachers: Learners is a placeholder, and enrollments are admin-only.

### N6. Labels don't match (P2)

- "Messages" (teacher) and "Discussions" (student) are the same thing.
- "Study" is flashcards only.
- One page is called "My courses", "My learning" and "Courses" in different places.
- The admin sees a "Teaching mode" badge while in the Admin section.

### N7. The review screen has weak calls to action (P2)

- "Review and publish" is a secondary button.
- There's no breadcrumb.
- Out-of-date copy: "Students study them in a later update".
- A job with no worker shows "Queued" with no hint.

### N8. No first-run guidance (P1)

Add a "Get your course live" checklist (module → video lesson → review → publish) on the dashboard and the course page. The "Start your first course" empty state currently sits at the bottom, below empty tables.

### N9. Mobile hides most student pages (P2)

- The phone tab bar is Home, Explore, Courses, Profile.
- Study, Calendar, Discussions, Grades, Progress and My space are behind Profile → More.
- The lesson player has no menu and no notification bell.

### N10. Two nav items are "Coming soon" pages (P1)

- `/instructor/learners`
- `/progress`

**Fix:** hide them until they're built.

### Proposed navigation

- **Instructor:**
  - Overview, with the setup checklist.
  - Courses. Each course gets tabs: Curriculum (with "Upload lecture"), Assignments & quizzes, Gradebook, Calendar, Students, Settings.
  - Grading.
  - Questions.
  - Analytics.
  - "View as student" in the footer.
- **Admin:**
  - The Teaching group, plus Admin: Users, Courses & enrollments (course titles link to the builder), Roster, Terms, Audit.
  - A clear Teaching / Admin / Student-view switch.
- **Student:**
  - Home, My courses (with Explore as a button), Study (flashcards, quizzes, podcasts), Calendar, Grades, Discussions, My space.
  - Phone tabs: Home, Courses, Study, More.

---

## 6. Reliability and operations

| ID | Priority | Problem | Fix |
|---|---|---|---|
| R1 | P1 | **No error reporting.** There's no `instrumentation.ts` and no Sentry. Production errors show only a digest to the user and end up in short-lived logs | Add `instrumentation.ts` with `onRequestError` sending to Sentry (the free tier is enough), and report task failures too |
| R2 | P1 | **An unexpected error inside a server action replaces the whole page** (for example a database "fetch failed"). Typed grading feedback is lost and a flashcard session resets (`components/coursework/grade-form.tsx:39`, `components/study/flashcard-deck.tsx:72`) | Wrap action bodies so they log and return a typed error |
| R3 | P1 | No `loading.tsx` anywhere and no `global-error.tsx`. The lesson player, course page and sign-in areas have no `error.tsx` | Add loading skeletons per section and a global error page |
| R4 | P1 | **Environment variables aren't checked at startup.** A missing Trigger key causes V2. A missing Blob token shows only "The upload couldn't be started" | Add a zod schema over `process.env`, checked at startup, including the DEMO_MODE rule from S1 |
| R5 | P1 | **Trigger.dev settings:** it runs on deprecated Node 21 ([trigger.config.ts:18](trigger.config.ts#L18)). No task asks for a larger machine. Document ingest loads files of up to 200 MB into memory (`trigger/lib/ingest-document.ts:113-117`), so it can run out of memory | Use `node-22`, give ingest, faststart and transcription a `medium-1x` machine, and stream documents to disk |
| R6 | P1 | **Production background tasks are out of date** until `npm run trigger:deploy` is run. Trigger.dev prod env vars and the Clerk dashboard steps (session-token claim, webhook secret, restricted sign-up) are still listed as your action in the tracker | Deploy from CI and tick off the dashboard checklist |
| R7 | P1 | The chat routes set no `maxDuration`, so a long answer can be cut off mid-stream and the turn isn't saved | Export `maxDuration` and fit the engine timeouts inside it |
| R8 | P1 | **Deleting a lesson or module leaves its files in Blob storage** (videos up to 2 GB, documents, podcasts) and doesn't stop running jobs (`app/(instructor)/instructor/courses/actions.ts:206-211, 316-319`) | Collect file links and cancel jobs before deleting, as private notes already do. Add a periodic clean-up of unused files |
| R9 | P1 | **Data export and account deletion aren't built**, though the product overview promises them. A deleted Clerk user is only flagged; their private notes, chats, submissions and files stay. 10 foreign keys to `users` have no delete rule | Add an erase task on `user.deleted` and a self-serve export |
| R10 | P1 | **No backup or restore plan.** `demo:reset` is guarded only by DEMO_MODE, so pointing it at the wrong database wipes it | Choose a Neon plan with point-in-time restore (Launch: 7 days). Dump before reset. Add a database-host allowlist to the reset script |
| R11 | P2 | CI runs only on pushes to `main` and on PRs. The end-to-end job needs a target with demo mode on and never resets, so a second run finds the submission already graded | Run the reset before the e2e job, or use a throw-away database branch |
| R12 | P2 | Smaller gaps: `audit_log` has no `created_at` index; `ai_usage`, `jobs` and `notifications` have no retention; there's no "draft ready" notification to the teacher | Add as needed |

---

## 7. Performance: why the app is slow

### Measured on 29 Sep 2026 from the development machine in India

| What | Time |
|---|---|
| One database query (warm) | **~310 ms** |
| First queries after a few idle minutes (the free database sleeps) | **940–1,220 ms** |
| 5 queries one after another | ~1,550 ms |
| The same 5 queries sent as one batch | **311 ms** |
| Network connect to Ohio (where the database is) | 383 ms |
| Network connect to Singapore / Mumbai | 159 ms / 123 ms |

### Three causes

1. **Distance.** The database is in Ohio, USA (Neon `us-east-2`). Every query crosses the world.
2. **Pages query one step at a time.**
   - Each query is its own network call, because the database driver is `neon-http` ([lib/db/client.ts:4](lib/db/client.ts#L4)).
   - Pages run 5–22 queries mostly one after another.
   - Some access checks are repeated between the layout and the page.
3. **No loading screens.** There's no `loading.tsx`, so every click looks frozen until the whole page is ready.

If you test with `npm run dev`, each page is also compiled on first visit. A production build is faster.

### Round trips before the page can render

Each round trip is ~310 ms from India:

| Page | Today | After batching |
|---|---|---|
| Course detail | 5 in sequence | 2 |
| Course builder | 4 | 2 |
| Lesson editor | at least 6 | 3 |
| Review page (also downloads the whole transcript it doesn't use) | 5–7 | about 3 |
| Lesson player | 4 in sequence, about 22 separate requests | 3, and 2 requests |
| Student home / teacher dashboard | 3 | 2 |
| Assistant, before the answer starts | 6–7 | about 3 (first words about 1.5 s sooner) |

### Fixes, biggest first

| # | Fix | Effort | Effect |
|---|---|---|---|
| 1 | Send each page's queries in one `db.batch`. Stop repeating access checks (`requireCourseStaff` next to `getLessonForUser` / `getCourseForUser`). Fold the access check into `getCourseForUser`'s batch | 2–3 days | Pages drop from 2–3.5 s to about 0.6–1 s, even with the database in the US |
| 2 | Add `loading.tsx` skeletons to the student, course, lesson player, instructor and lesson editor sections | ½ day | Every click responds instantly |
| 3 | Assistant: run the pre-answer steps in parallel, don't wait on saving the question or the usage log before streaming, and join document titles into the search | 1 day | First words about 1.5 s sooner |
| 4 | Move everything to **Singapore**: a new Neon project in `ap-southeast-1` (a Neon region is fixed when the project is created, so this means a copy), Vercel functions in `sin1`, and the Blob store in `sin1` (or R2). Neon has no India region | 1 day plus a data copy | Queries take ~1–5 ms from the server. Students in India are ~60–150 ms from the server instead of ~380 ms |
| 5 | On a paid Neon plan, keep the database awake during class hours | A setting | Removes the ~1 s wake-up delay |
| 6 | Smaller wins: cache `dueCountsByCourse` (it runs twice on `/study`); check Trigger.dev run status only for jobs older than a few minutes; lazy-load the Ask, Quiz and Podcast tabs (about 95 KB gzipped of KaTeX, marked and DOMPurify, estimated) | 1 day | Faster lesson player |

Already fine:

- The transcript list is virtualised.
- The video uses `preload="metadata"` and a poster.
- The vector and full-text search indexes exist.
- The notification bell refreshes on navigation or focus, and about every 90 s while visible.

---

## 8. Monthly cost estimate for 500 students

### 8.1 What changes from the demo setup

The demo runs almost free. For a paying tuition provider, four things have to change:

1. **Vercel Pro is required.** The Hobby plan is for non-commercial use only.
2. **The AI must use paid models.** The chains start with OpenRouter's free models:
   - They allow 20 requests a minute and 1,000 a day.
   - NVIDIA's free endpoint logs prompts, which is a privacy problem for student data.
3. **The database needs a paid plan** for backups (point-in-time restore) and to stay awake.
4. **Video delivery is charged per GB.** Vercel's flat-rate bundle excludes sites where media is most of the traffic.

### 8.2 AI cost per action, from your own usage log

`ai_usage` has 332 calls totalling $0.14 so far. I re-priced its token counts at paid-model rates:

| Action | Tokens seen in logs | Cost at paid rates |
|---|---|---|
| Processing 1 hour of lecture (transcript, chapters, notes, cards, quiz, index) | about 127k in / 99k out | **about $0.15–0.20** |
| One assistant question | about 1.2k in / 150 out per call (budgeted at 3k in / 500 out for safety) | **$0.0005** (Nemotron) to **$0.002** (Gemini 2.5 Flash) |
| One student upload (notes, cards, quiz, index) | about 13k in / 17k out | **about $0.04** |
| One podcast episode | script plus speech | **about $0.01–0.03** |

### 8.3 Usage assumptions

| Per month | Light | Typical | Heavy |
|---|---|---|---|
| Video watched per student | 8 h | 20 h | 40 h |
| Total hours watched | 4,000 | 10,000 | 20,000 |
| Video data delivered (720p at about 1 Mbps ≈ 450 MB/h) | 1.8 TB | 4.5 TB | 9 TB |
| New lecture hours uploaded | 40 | 120 | 250 |
| Assistant questions per student | 20 | 60 | 150 |
| Private uploads per student | 1 | 4 | 10 |
| Podcasts generated | ~100 | ~740 | ~2,000 |

### 8.4 A typical month, by service

| Service | Current design (videos on Vercel Blob) | With videos on Cloudflare R2 |
|---|---|---|
| Vercel Pro (hosting) | $20–40 | $20–40 |
| **Video delivery and storage** | **$230–320** (4.5 TB at $0.05–0.067/GB) | **$5–15** (R2 doesn't charge for delivery; storage $0.015/GB) |
| Neon database (Launch plan, about 0.5 CU for 16 h a day) | $20–30 | $20–30 |
| Trigger.dev Pro (background jobs; about $30 of compute fits in the included $50) | $50 | $50 |
| Clerk logins (free up to 50,000 users; Pro removes branding) | $0–25 | $0–25 |
| AI through OpenRouter (paid models, plus the 5.5% credit fee) | $150–200 | $150–200 |
| Sentry error reporting (free tier) | $0 | $0 |
| **Total** | **about $470–665** | **about $245–360** |
| In rupees (at about ₹88 per US$, before GST) | about ₹41k–59k | about ₹22k–32k |
| Per student | about $0.95–1.35 | about $0.50–0.70 |

### 8.5 All three scenarios

| Scenario | Current design | With R2 video |
|---|---|---|
| Light | $170–240 (₹15k–21k) | $80–120 (₹7k–11k) |
| **Typical** | **$470–665 (₹41k–59k)** | **$245–360 (₹22k–32k)** |
| Heavy | $1,030–1,360 (₹91k–120k) | $580–760 (₹51k–67k) |

The heavy scenario also includes Clerk Pro and Sentry Team, plus extra Trigger.dev and Neon usage.

### 8.6 What drives the cost, and how to control it

1. **Video delivery is the biggest cost.** Moving videos to Cloudflare R2 saves $100–600 a month depending on usage. R2 also gives expiring private links, which fixes S6. Check Cloudflare's terms for serving video from R2 before switching.

   Two more ways to cut video cost:
   - Lectures that are mostly slides can be encoded at about 0.4 Mbps, which halves the video cost on Blob.
   - Keep each file under **512 MB**. Vercel Blob never caches larger files, and every view of one then costs extra.

   Other options, for comparison:
   - Bunny CDN (Asia): about $0.03/GB, so about $135 for 4.5 TB.
   - Cloudflare Stream or Mux: about $400–600 a month at this volume. They add adaptive streaming, which helps students on weak mobile data.
2. **AI is second, and it's uncapped today.** One abusive account can multiply this line. S2's per-student daily budget is what keeps it predictable. Using Nemotron (paid) instead of Gemini Flash for chat saves about $45 a month in the typical case.
3. **Region affects cost too.** Vercel's Mumbai (`bom1`) rates are about 10–35% higher than the US (`iad1`) rates. Singapore rates weren't checked.

### 8.7 Prices used (vendor pages checked 29 Sep 2026; USD, taxes extra)

| Service | Price used |
|---|---|
| Vercel Pro | $20/month with $20 usage credit. On-demand data transfer $0.15/GB (iad1), $0.20/GB (bom1). Hobby is non-commercial only |
| Vercel Blob | Storage $0.023/GB-month. Data transfer $0.05/GB (iad1), $0.067/GB (bom1). Files over 512 MB are never cached |
| Neon | Launch: $0.106 per CU-hour, $0.35/GB-month, 7-day restore. No India region; nearest is Singapore |
| Clerk | Free up to 50,000 monthly returning users. Pro $25/month |
| Trigger.dev | Hobby $10/month ($10 credit), Pro $50/month ($50 credit). small-1x machine $0.0000338/s. $0.000025 per run |
| OpenRouter | Nemotron 3 Super $0.08–0.085 / $0.40–0.45 per M tokens. Gemini 2.5 Flash $0.30 / $2.50. Whisper turbo about $0.012/hour. Kokoro TTS $0.62 per M characters. Embeddings $0.02 per M. 5.5% fee on card top-ups |
| Cloudflare R2 | $0.015/GB-month, free delivery (egress) |
| Bunny CDN | Asia $0.03/GB |
| Mux | 100k minutes/month free, then $0.0008/min at 720p |
| Sentry | Free: 5k errors. Team: $26/month |

Sources: vercel.com/pricing, vercel.com/docs/vercel-blob/usage-and-pricing, vercel.com/docs/pricing/flat-rate-cdn, neon.com/pricing, neon.com/docs/introduction/regions, clerk.com/pricing, trigger.dev/pricing, the OpenRouter models API and docs (FAQ, limits), and the Cloudflare R2/Stream, Bunny, Mux and Sentry pricing pages.

---

## 9. What's already solid

- **Access control in every query.** Content, file links and vector search are all checked inside the SQL, and the security review found no case where changing an id reaches another user's data.
- **Input validation.** zod checks every action and route, and every action returns a typed result.
- **Staff and admin changes are audited** in the same database batch as the change.
- **The web-link fetcher is hardened.** DNS is checked at connect time, redirects are re-checked, private address ranges are blocked, and size is capped.
- **User content is sanitized before display.** Posts escape raw HTML, and notification links must be in-app paths.
- **Security headers and CSP are in place** (HSTS, frame-ancestors none, nosniff). CI scans the client bundle for secrets.
- **Every AI call is logged in `ai_usage`.**
- **Background jobs are protected against duplicates.** Runs are checked against the real Trigger.dev status, and documents, notes and podcasts recover from failures on their own.
- **Tests:** tsc and ESLint are clean, all 339 unit tests pass, and Playwright covers the 9 demo steps plus accessibility, mobile and performance checks.

---

## 10. Recommended plan

> **Update (29 Sep 2026):** this plan is now tracked as features 24–33 in
> `context/features/`: 24 security, 25 AI spend, 26 job recovery, 27
> course building, 28 navigation, 29 performance, 30 error handling, 31
> Learners and Progress, 32 private messages, 33 data export and
> deletion.
>
> The owner decided there will be **no infrastructure or plan changes
> while the app is on free tiers**. The region move, R2, paid plans,
> Sentry and bigger machines are on the "Deferred until paid plans" list
> in `context/progress-tracker.md`.

**Week 1: safety (P0)**

1. S1: lock down demo mode.
2. V2 and V3: fix the stuck-video bug and add job expiry.
3. S4: stop graded quizzes from revealing answers early.
4. S5: close the upload loophole.
5. S2 and S3: add a daily AI budget per student and make the rate limits atomic.
6. Restrict sign-up in Clerk.

**Week 2: the experience**

1. V1, N1 and N8: "Upload lecture" button, go to the new lesson after adding it, and the setup checklist.
2. N2 and V4: one Publish behaviour, and no publishing without a video.
3. N3, N4 and N10: "View as student", breadcrumbs, and hide the placeholder pages.
4. Performance fixes 1–3: batched queries, loading screens, assistant streaming.

**Week 3: operations**

1. R1 and R2: Sentry and safe action errors.
2. R4, R5 and R6: environment checks, Trigger.dev runtime and machines, and a CI deploy.
3. R8, R9 and R10: file clean-up on delete, data export and deletion, and backups.

**Infrastructure decisions (can run in parallel)**

- Move to Singapore (performance fix 4).
- Move video storage to Cloudflare R2 (section 8.6, S6).

---

## 11. Decisions needed from you

1. **Video storage:** stay on Vercel Blob, or move to Cloudflare R2 (saves about $200+ a month and gives private links)?
2. **Region:** move the database and hosting to Singapore now, while the data is still small?
3. **AI models in production:** Nemotron (cheapest) or Gemini 2.5 Flash (steadier with structured output) for chat? And what daily AI budget per student?
4. **Sign-up:** invite-only (roster import and invitations), or open?
5. **Graded quizzes:** show answers after the due date, or only after the last attempt?
6. **Clerk Pro** ($25/month) to remove the "Secured by Clerk" branding and allow custom session lengths?

---

## Appendix A: Not verified, and out-of-date notes

**Not verified:**

- Whether Vercel's flat-rate CDN is on by default, and whether Vercel would rule this app's video traffic out of it.
- Whether the Clerk dashboard has the session-token claim set and sign-up restricted.
- Whether Clerk's free plan explicitly allows production use (a custom domain is included, which suggests it does).
- Whether Bunny's cheapest network covers India.
- Singapore (`sin1`) Vercel rates.
- The default Trigger.dev machine size.

**Documentation that's out of date:**

- `AGENTS.md` lists `context/security-architecture.md` (a "9-layer security model" with spending cap, catalog trust, guardrail, proposal and payment layers). That file doesn't exist, and those layers look copied from another project. What this app actually has:
  - rate limits (raceable, see S3);
  - CSRF protection through Next.js's server-action origin check and Origin checks on the API routes;
  - zod request validation;
  - the audit log;
  - a one-sentence prompt-injection instruction.

  There is no spending cap.
- `context/progress-tracker.md` still lists the "4 stale engine tests" (now fixed) and says `.trigger/tmp` is 5.6 GB (it's now tiny).
- `context/features/feature-23-hardening-demo-polish.md`: check that its status matches the work now on `main`.

## Appendix B: Raw measurements (29 Sep 2026)

```
Database host: *.c-7.us-east-2.aws.neon.tech
Sequential "select 1" (ms): 1221, 942, 333, 306, 315, 312, 303, 310
5 queries in parallel: 964 ms
5 queries in one batch: 311 ms
TCP connect: us-east-2 383 ms · ap-southeast-1 159 ms · ap-south-1 123 ms

ai_usage to date: 332 calls, $0.1436 total
  gemini-2.5-flash $0.084 · whisper-large-v3-turbo $0.030 · nemotron-3-super (paid) $0.014
  kokoro-82m $0.008 · text-embedding-3-small $0.0008 · nemotron-3-super:free 62 calls, $0
Lecture videos: 2 × 20 min at 854×480, 10.8 MB each (the looped test lecture)
```
