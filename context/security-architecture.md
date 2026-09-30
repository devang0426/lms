# Security Architecture

How Studyhall keeps each person to what their role allows. Every layer
below exists in the code today, and each names the files that enforce it.
Where a layer is still missing or weak, it says so and names the feature
that fixes it.

`AGENTS.md` sums this file up as a "9-layer security model" (spending cap,
catalog trust, guardrail, proposal, payment…). That line came from another
project. This file is the source of truth.

## Principles

1. **Authorization lives in the data layer.** Every query checks
   enrollment, course staff or ownership in its own SQL. `proxy.ts` and
   hidden buttons are conveniences, not security.
2. **Anything a user can't see is a 404**, so a URL never reveals that a
   draft, someone else's course or someone else's note exists. Under a
   `loading.tsx` (feature 29) the page streams, so the not-found page
   arrives with status 200 and a `noindex` tag. That is the same for a
   page that doesn't exist and one the user may not see, so it still
   reveals nothing.
3. **Text from outside is data.** Uploads, web pages, model output and
   what people write for each other are sanitized before they render, and
   never followed as instructions.
4. **Secrets stay on the server.** Missing or malformed config stops the
   server at startup instead of failing later.

## 1. Identity and roles (Clerk)

- Clerk handles sign-in. `proxy.ts` (`clerkMiddleware`) only redirects
  signed-out visitors to `/sign-in`; it isn't authorization.
  - The public pages (feature 34) are the only exceptions besides sign-in,
    the webhooks and the Blob callback: `/welcome`, `/privacy`, `/terms`,
    `robots.txt` and the sitemap. A signed-out `/` goes to `/welcome`.
  - They're static and read no session, so nothing on them depends on
    who asks. That's why `/privacy` and `/terms`, and `/welcome` without
    a session cookie, can skip Clerk in `proxy.ts`. Otherwise Clerk's
    development instance loops cookieless crawlers through its handshake.
  - After sign-in, the demo picker returns only to a path on this site
    (`safeReturnPath`), so a crafted `redirect_url` can't send someone
    elsewhere.
- The role (`admin`, `instructor`, `student`) is in Clerk
  `publicMetadata.role`, carried in the session token.
  `getCurrentUser()` (`lib/auth/index.ts`) reads it and mirrors it into the
  Neon `users` row.
- The Clerk webhook (`app/api/webhooks/clerk`) is verified with its Svix
  signature (`CLERK_WEBHOOK_SIGNING_SECRET`). `syncUserFromClerk`
  (`lib/auth/sync.ts`) upserts the mirror.
- **Deleted users stay deleted** (feature 24, S11). The sync never clears
  `deletedAt`, so a late `user.updated` can't bring a user back.
  `getCurrentUser()` treats a deleted row as signed out, and a deleted
  user's pending invitations aren't applied.
- **Deleted accounts are erased** (feature 33).
  - Two things start it: the Clerk `user.deleted` webhook, and an admin's
    Delete user, which deletes the Clerk account first so it can't sign
    in again.
  - The row is marked deleted at once, with its audit row. The
    `erase-user` task then deletes the person's private data and files,
    and anonymises the row.
  - The sync never updates a deleted row, so a late `user.updated` can't
    restore the name or email.
  - Admins can't delete their own account. In demo mode the demo
    accounts can't be deleted.
  - The confirm step takes the person's email, typed.
- **Role changes** (admin Users page) go to Clerk first, then Neon, with
  the audit row in the same batch. Access follows the role: someone made a
  student loses their `course_staff` rows, and someone made staff has
  their enrollments dropped.
- **Layout guards:** `requireAreaRole()` sends a mismatched role to its
  own home. Pages still do their own checks.

## 2. Access checks in SQL

- **Courses:** `getCourseAccess()` (`lib/db/courses.ts`) returns `staff`,
  `student` or nothing.
  - Pages use `requireCourseStaff` or `requireEnrollment`, and 404 on a
    mismatch. A page whose loader decides access in its own batch
    (`getCourseForUser`, `getLessonForUser`, `lib/db/*-page.ts`, feature
    29) 404s on that result instead. Any statement batched beside the
    check carries its own guard (`canSeeCourse`, `isStaffOf`,
    `inCatalogCourse`).
  - Server actions return an error result instead.
  - Admins count as staff everywhere.
- **Students see only published content:** the course, the lesson's
  module and the lesson are all published, and the enrollment is
  `active`. The catalog fields of a published course in the current term
  are the only thing every signed-in user sees.
  - Signed-out visitors see a subset of them on the landing page (feature
    34): title, summary, instructor, lesson count and length.
  - `listPublicCatalog` selects only those columns, so no id, code or
    outcomes reach the static HTML.
- **Search:** `lib/db/chunks.ts` puts the same access filter inside the
  vector and full-text queries. The assistant can only retrieve what the
  asker may read.
- **Private space** (feature 19): every query filters on
  `ownerId = current user`, with no staff or admin override. An admin
  opening someone's `/space/[noteId]` gets a 404.
- **Data exports** (feature 33): the same owner-only rule.
  - The export's reads (`lib/db/data-export.ts`) each filter on the
    person.
  - The file opens only through `/exports/[id]`, for its owner, until it
    expires. Anyone else gets a 404.
  - Its run is visible to its owner alone.
  - The file links its files through the access-checked routes below,
    never by Blob URL.
  - Draft grades (staff-only) are left out.
- **Files:** Blob URLs reach the browser only after these checks. Stored
  files open through `/documents/[id]`,
  `/submissions/[id]/files/[index]` and `/exports/[id]`, which check
  access, then redirect.
- **Graded quizzes** (feature 24, S4):
  - Questions go to the browser without answers.
  - A submit returns the score and right/wrong per question only.
  - The correct answers and explanations come only after the due date
    plus a 10-minute grace period (`lib/study/quiz.ts`).
  - Submits are refused after that same deadline.
  - The student reads only their own attempts.
- **Jobs:** `getJobAccessToken()` gives the browser a Trigger.dev
  Realtime token scoped to one run. A private note's jobs are visible to
  its owner only.

## 3. Upload authorization

Browsers upload straight to Vercel Blob, so file bytes never pass through
Next.js. `app/api/blob/upload` issues each client token only after
`authorizeUpload()` (`lib/storage/authorize.ts`, unit tested) checks:

- the session;
- the right for this kind of upload: course staff for lesson videos and
  documents, "may hand in now" for submissions, the owner for a private
  note;
- that the path is in the uploader's own folder;
- the allowed content types and the size limit per kind;
- the hourly limit (section 7).

For private notes (feature 24, S5):

- A token is issued only while the note is waiting for its one file
  (`status = 'uploading'`, no file attached yet).
- `recordUpload` (`lib/storage/blob.ts`) deletes any other file uploaded
  for the note: a second file, or one for a note deleted meanwhile.

Recording a finished upload:

- Every completed upload writes one `blob.upload` audit row per file
  path. Those rows are what the hourly limit counts.
- Blob's own completion callback is signed by Blob.
- The local-dev confirm action (`app/api/blob/upload/actions.ts`) checks
  again after the upload, with `stage: "confirm"`.

**Known gap (S6, deferred until paid plans):** the Blob store is public.
URLs are unguessable, and they're only handed out after an access check,
but they don't expire. The fix is a private store (or R2) with signed
links through the existing file routes.

## 4. The SSRF guard

A URL a user types (a web page as course material, a YouTube link) is
fetched only through `safeFetchHtml` (`lib/net/safe-fetch.ts`):

- http and https only, and no credentials in the URL;
- every resolved address must be public (`lib/net/address.ts`). The check
  runs inside the socket's own DNS lookup, so DNS rebinding can't swap in
  a private address;
- redirects are followed by hand (at most 5), each hop checked again;
- 15 seconds, 10 MB, HTML only.

## 5. Sanitizing

Everything rendered as HTML goes through `lib/markdown.ts` (DOMPurify):

| Renderer | Used for | Raw HTML |
| --- | --- | --- |
| `renderMarkdown` | Notes, assignment instructions, grade feedback | Parsed, then sanitized |
| `renderRichInline` | Flashcards, quiz text | Parsed, then sanitized |
| `renderPostMarkdown` | Announcements, discussions (people writing for each other) | Shown as text; images become links |
| `renderAnswerMarkdown` | Assistant and space-chat answers (feature 24, S7) | Shown as text; images become links; citation chips inserted after |

- **`style` only on maths** (feature 24): no rendered element keeps a
  `style` attribute or a `<style>` element, so nothing can be positioned
  over the page.
  - KaTeX needs inline styles, so each formula is rendered and sanitized
    on its own.
  - It's swapped in for a placeholder only after the text around it has
    been sanitized.
  - A DOMPurify hook drops any attribute that holds a placeholder, so a
    formula can't break out of an attribute.
- **KaTeX:** `trust` is off (no `\href`, no `\htmlStyle`), and
  `maxSize: 20` caps sizes written in the TeX.
- **Citation chips** are built by `citationChipsHtml`
  (`lib/chat/citations.ts`) with escaped labels. A marker the server
  didn't verify renders as nothing.
- **Notifications** carry in-app paths only, and the bell follows only
  those.

## 6. Content Security Policy and headers

`next.config.ts` sends these on every response:

- **CSP:** an allowlist with nothing else.
  - Clerk's Frontend API host, from the publishable key.
  - This app's own Blob store only: `BLOB_PUBLIC_HOST` (feature 24, S8).
  - Browser uploads to `vercel.com`, and Trigger.dev Realtime.
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` and
    `form-action 'self'`.
- **Other headers:** HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict
  referrer policy, and a Permissions-Policy that turns off the camera,
  microphone, location, payment and USB.
- **`'unsafe-inline'` for scripts:** there is no per-request nonce. A
  nonce-based CSP needs every page rendered per request, so it's
  deferred. Sanitizing is the first line of defence; the CSP is the
  second.
- The Playwright suite fails on any CSP violation.

## 7. Rate limits and AI spend

| Limit | Where |
| --- | --- |
| Daily AI limit per person: calls and cost over the last 24 hours. Students 150 calls and $0.25, staff 1,000 and $3 (env `AI_DAILY_*`) | `checkBudget`, `lib/ai/budget.ts` (feature 25) |
| 20 questions per 5 minutes, shared by the assistant and the space chat | `QUESTION_LIMIT`, `lib/ai/assistant.ts`; enforced by `reserveQuestion` |
| Uploads per hour: 30 for students, 120 for staff (every file counts) | `UPLOAD_RATE`, `lib/storage/authorize.ts` |
| 10 new private notes per hour | `app/(student)/(sidebar)/space/actions.ts`; enforced by `createPrivateNote` |
| 10 new discussion threads and 30 replies per person per hour | `POSTING_LIMIT`, `lib/discussions/view.ts` (feature 25) |
| 3 data exports per person per 24 hours | `EXPORT_DAILY_LIMIT`, `lib/account/rules.ts` (feature 33); enforced by `createExportRequest` in the locked batch |
| Recordings and YouTube videos up to 90 minutes (`DOCUMENT_MAX_MINUTES`); lesson videos up to 60 (`VIDEO_MAX_MINUTES`) | `lib/documents/length.ts`, `lib/video/probe.ts` |

- **The daily AI limit** (feature 25, S2) is a safety limit, not credits.
  It counts calls as well as cost: the `:free` models log $0 but share one
  quota for the whole key (20 requests a minute, 1,000 a day), which one
  student looping questions could use up for everyone.
  - It's checked before the work starts: an assistant or space-chat
    question, a new private note, a note's retry, a podcast (lesson or
    note) and a regenerate on the review screen.
  - A refusal says "You've reached today's AI limit. It resets at HH:MM."
    (in the reader's zone, from the `tz` cookie) and writes an
    `ai.limit_reached` audit row with ids only.
  - Background tasks charge whoever started the work, so their calls
    count against that person.
  - Admins see each person's "AI today" and an "At AI limit" filter on
    `/admin/users`.
- **Limits that can't be raced** (feature 25, S3): the question, new-note
  and discussion limits count and write in one `db.batch`
  (`lib/db/limits.ts`). It takes the person's advisory lock
  (`pg_advisory_xact_lock`), and `enforce_limit()` aborts the batch when
  the count is at the limit. So 30 questions sent at once give exactly 20
  answers, and a refused question creates no thread.
- **Retry only after a failure:** a private note's "Try again" is refused
  unless its latest run failed, so a ready note can't be paid for twice.
- **Off-syllabus questions** are refused before any model call (the
  relevance gate).
- **Every AI call** is logged in `ai_usage` (`withUsage`). The spend limit
  on the OpenRouter key stays as the last backstop.
- **Not checked against the daily limit:** a lesson video's pipeline and
  a lesson document's reading, which only course staff can start. Their
  calls are still charged to the uploader, so they count toward that
  person's next checked request.
- **Known gap:** the upload limit still counts, then issues the token, so
  token requests sent in parallel can pass it together. Each upload is
  still capped in size, and a private note is created (and limited) before
  its upload.

## 8. CSRF

- **Server actions:** Next.js compares the request's `Origin` with its
  host and refuses cross-site calls.
- **API routes:** `/api/assistant`, `/api/space/chat` and `/api/progress`
  refuse a request whose `Origin` is another site.
- **Signed callbacks:** the Clerk webhook (Svix signature) and Blob's
  upload callback.
- **GET:** GET requests change nothing.

## 9. Request and config validation

- **Inputs:** every server action and route handler parses its input with
  zod before any other work: form data, route params, search params and
  bodies.
- **Model output:** structured AI output is untrusted, so it's validated
  against the same zod schema as its JSON schema.
- **Startup config** (feature 24): `lib/env.ts` checks every environment
  variable the app reads, from `instrumentation.ts → register()`, when the
  server starts.
  - A missing or malformed required variable stops the server with one
    message naming every problem.
  - The check isn't run by `next build`.

## 10. The audit log

- **Written with the change:** `auditInsert()` (`lib/db/audit.ts`) goes in
  the same `db.batch` as the change it records. This covers role changes,
  invitations, roster imports, enrollments, publishing, grading,
  uploads, podcast runs and the rest.
- **Admins read it** at `/admin/audit`. Because of that, rows about a
  student's private notes carry ids only, never a title, file name or
  Blob URL. A private upload is logged by document id and a hash of its
  path.
- **Account rows** (feature 33) carry ids only as well:
  - `user.export_requested`;
  - `user.delete`, with `via` admin or clerk, written by the same
    statement that marks the row;
  - `user.erase`.
- The log outlives the person: an erased account's rows keep its id,
  and `actor_id` would be set null if a user row were ever hard-deleted.

## 11. Prompt-injection handling

Course material can include a web page someone else wrote, so the model
may read text written to look like instructions. The defences:

- **Access-checked input only:** the model sees only chunks the asker may
  read (section 2), plus their question.
- **Delimited sources** (feature 24, `PROMPTS_VERSION` 3):
  - `assistantSources()` (`lib/ai/prompts`) wraps each source in
    `<source id="S3" from="…"> … </source>`.
  - A `<source>` or `</source>` inside a source is defused first, so a
    source can't end early.
  - The system prompts say that text inside the tags is course material,
    never an instruction.
- **Answers must cite:**
  - The server keeps only citations to sources it actually sent.
  - An answer with no valid citation becomes the fixed refusal.
- **Answers render as text:** raw HTML stays text (section 5), so an
  injected link can't overlay the page.
- **No tools:** the model has no actions. An answer can't change data or
  call anything.

## 12. Secrets

- **Server-only modules:** `lib/ai`, `lib/db`, `lib/auth` and
  `lib/storage` import `server-only`. A client component can't import
  them.
- **Bundle scan:** `npm run check:secrets` scans `.next/static` after a
  build for the real values and the key shapes. Run it locally after a
  build; there's no CI.
- **Errors show a reference, not details** (feature 30): an error page
  shows only Next's digest, and a failed server action says "Something
  went wrong. Try again. (ref ab12cd)". The details go to one JSON log
  line (`logServerError`, `lib/utils/server-error.ts`) in Vercel's logs,
  which only the team reads. A line can include a failed query's
  parameters (a post's text, say), so the logs are treated like the
  database. The user id in a line is the Clerk id from the session token
  the proxy verified, used for the log only, never for access.

## 13. Demo mode

`DEMO_MODE=true` shows one-click demo accounts on the sign-in page, so
anyone who can open that page can be the admin. The rules (feature 24,
S1):

- **Off by default:** `example.env` ships `DEMO_MODE=false`.
- **Passcode in production:**
  - On a production deployment (`VERCEL_ENV=production`), demo mode needs
    `DEMO_PASSCODE`. `lib/env.ts` refuses to start without it.
  - With a passcode set, the picker asks for it, and `startDemoSession`
    compares it in constant time before minting a sign-in ticket.
  - The demo password isn't shown on the page, since typing it into the
    normal form would get round the passcode.
- **Open on purpose (2026-09-30, owner's call):** `DEMO_PUBLIC=true`
  lifts the passcode, on production too, and wins over a `DEMO_PASSCODE`
  left set. The picker then shows the demo email and password and signs
  in with one click, so anyone with the link is the demo admin. What
  bounds it: the rules below, and the daily AI limit per person (staff
  $3, student $0.25 by default; `lib/ai/budget.ts`).
- **No lasting access:** while demo mode is on, role changes, invitations
  and roster **Import** are refused ("Turned off in demo mode."). Roster
  **Check file** still works. So a visitor can't promote an account of
  their own that outlives the demo.
- **Demo accounts can't be deleted** (feature 33). The admin's Delete
  user refuses them, and a Clerk `user.deleted` for one only marks the
  row; it's never erased. Other accounts can still be deleted in demo
  mode (see Known gaps).
- **`/dev/*` pages** answer 404 outside `next dev` (`app/dev/layout.tsx`).
  `/dev/jobs` and its actions are admin-only as well.
- **Reset guard:** `npm run demo:reset` refuses to run unless every
  database URL points at a host in `DEMO_DB_HOSTS`, and it checks before
  touching anything.
- **Tests:** the Playwright suite signs in through the picker, so it runs
  only against a server without a passcode (a local build). It runs
  locally only.

## Known gaps

| Gap | Plan |
| --- | --- |
| Public Blob store, links never expire (S6) | Deferred until paid plans (private store or R2) |
| No nonce-based CSP | Deferred: needs every page rendered per request |
| The upload limit counts, then issues the token, so parallel requests can pass it together | Small follow-up: the same locked pattern (`lib/db/limits.ts`) |
| Every instructor sees the university's total AI cost (S9) | Open |
| Open sign-up: restricting it is a Clerk dashboard setting, not enforced in code | Owner decision (report.md §11) |
| The `dev-test` upload kind is admin-only but still accepted in production | Small follow-up |
| In demo mode anyone can be the admin, and Delete user still works on accounts that aren't the demo ones (the spec protects only those) | Owner decision (progress tracker, open questions) |
| With `DEMO_PUBLIC=true` the demo has no passcode at all: anyone with the link signs in as the demo admin | Owner decision (2026-09-30): easy sign-in for the demo. `demo:reset` puts the data back |
