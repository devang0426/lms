# Feature 29: Performance (software only)

**Status:** Done (2026-09-30), except the LCP check, which today's
network couldn't settle. Details are in `../progress-tracker.md` under
Completed.
**Depends on:** 24
**Demo step:** all
**Source:** `report.md` (production-readiness audit, 2026-09-29): section 7.

## Goal

Every click shows something straight away, and pages render in about 1
second. This must hold with the database still in `us-east-2` on Neon's
free plan.

## Why it's slow (measured 29 Sep 2026 from the development machine)

| What | Time |
|---|---|
| One query, warm | ~310 ms |
| First queries after idle (the free database sleeps) | 940–1,220 ms |
| 5 queries one after another | ~1,550 ms |
| The same 5 in one `db.batch` | **311 ms** |

Three things make it slow:
- **Every query is its own network round trip.** The driver is `neon-http` (`lib/db/client.ts:4`).
- **Pages run 5–22 queries, mostly one after another.** Some access checks also run twice, once for the layout and once for the page.
- **There's no `loading.tsx` anywhere.** Every click looks frozen until the whole page is ready.

## Scope

**In:**
- One batch of queries per page.
- No duplicate access checks.
- Loading skeletons.
- A faster route from question to the assistant's first words.
- Caching repeated reads.
- Fewer Trigger.dev calls while pages render.
- A lighter lesson player bundle.
- A query counter to measure progress.

**Out** (deferred until paid plans; see the progress tracker):
- Moving the region to Singapore.
- Keeping the database awake.
- Any plan change.

## Targets

Round trips before the page can render:

| Page | Today | Target |
|---|---|---|
| Course detail (`app/(student)/(topnav)/courses/[courseId]/page.tsx:46-67`) | 5 in sequence | 2 |
| Course builder (`app/(instructor)/instructor/courses/[courseId]/page.tsx:17-19`) | 4 | 2 |
| Lesson editor (`…/lessons/[lessonId]/page.tsx:30, 31, 56, 140`) | at least 6 | 3 |
| Review page (`…/review/page.tsx:28-45`) | 5–7 | 3 |
| Lesson player (`app/(student)/(focus)/…/page.tsx:47-80`) | 4 in sequence, about 22 requests | 3, and 2 requests |
| Student home, teacher dashboard | 3 | 2 |
| Assistant, before the first word (`app/api/assistant/route.ts:42-56`) | 6–7 | 3 |

## Tasks

1. **Query counter.** A development-only switch (`DB_LOG=1`) wraps the Neon client and logs each request's time per render. It's used to measure before and after each change.
2. **Access checks:**
   - Fold `getCourseForUser`'s access row into its batch. Today it costs 2 round trips (`lib/db/courses.ts:105, 115`); it becomes 1.
   - Drop `requireCourseStaff` wherever `getCourseForUser` or `getLessonForUser` already checks staff access. That's the course builder and the lesson editor.
3. **One batch per page.** Put independent reads into one `db.batch` after the access check, on the pages in the table. The page-specific changes:
   - **Lesson player:**
     - Transcript segments are read through a join on `videos.lesson_id` (`lib/video/lessons.ts:127, 134`).
     - The latest chat turns are read through a subquery (`lib/db/chat.ts:50, 57`).
     - The assignment work lookup goes into the same batch (`lib/db/assignments.ts:103, 105`).
   - **Review page:**
     - The four `latestJobFor` calls become one `DISTINCT ON (kind)` query.
     - `loadDraftSource` (`lib/db/lesson-content.ts:42-93`) is replaced with an "is there a source" check. The page doesn't use the whole transcript it downloads today.
   - **Student home and dashboard:**
     - Student home: filter by the enrollment subquery instead of a list of ids (`components/student/load-courses.ts:11-13`).
     - Dashboard: the same approach (`lib/db/dashboard.ts:35, 58`).
4. **Loading screens.** Today there are none.
   - **Skeleton primitive.** Add a `Skeleton` to `components/ui/`, with blocks, text lines and a card shape.
     - Use the existing tokens: the Oat surface, `rounded-card`, and a gentle pulse.
     - Turn the pulse off under `prefers-reduced-motion`.
     - Add it to the `/dev/ui` gallery and to `ui-context.md`.
   - **`loading.tsx` per section.** Each one keeps the shell's navigation and shows a skeleton shaped like its page:
     - `(student)/(sidebar)`;
     - `(student)/(topnav)/courses/[courseId]`;
     - `(student)/(focus)/…/lessons/[lessonId]`, with the video area, tabs and transcript;
     - `instructor/`;
     - the lesson editor;
     - `admin/`.
   - **Pending link indicator.** A slim bar at the top shows while the next page loads, so a click always gets an instant response. Check the Next 16 docs for `useLinkStatus` before building it.
   - **`<Suspense>` for slow secondary panels:** the player's Discussion, Podcast and Quiz tabs, and the dashboard's grading list.
   - Read `node_modules/next/dist/docs/` on loading UI, linking and navigating, and streaming, first.
5. **Assistant:**
   - Run the rate-limit count alongside `getCourseForUser`.
   - Skip `listTurns` for a new thread.
   - Don't wait for `addUserTurn` or the `ai_usage` inserts before streaming. Use `after()` for writes that aren't needed yet.
   - Join document titles into the search query, instead of `documentTitles` afterwards (`lib/ai/assistant.ts:170`).
6. **Caching repeated reads.**
   - Wrap `dueCountsByCourse` in React `cache()`. `/study` runs it twice today, once in the layout notice and once in the page (`study/page.tsx:22`).
   - Don't use `unstable_cache` or `'use cache: private'` for the user lookup. See the notes in the Next 16 docs.
7. **Fewer Trigger.dev calls.** `reconcileJob` (`lib/jobs/index.ts:104`) calls `runs.retrieve` only for jobs older than about 3 minutes. Realtime already reports fresh progress.
8. **A lighter lesson player:**
   - Load the Ask, Quiz and Podcast tab bodies with `next/dynamic`. KaTeX, marked and DOMPurify are roughly 95 KB gzipped (estimated).
   - Render flashcard HTML on the server.

## Acceptance criteria

- [x] Each page in the table meets its target, counted with `DB_LOG=1` on a production build.
- [x] Every section has a `loading.tsx`, and clicking a nav link shows the skeleton immediately. The top bar shows while a page is loading.
- [x] `Skeleton` is in `components/ui/`, `/dev/ui` and `ui-context.md`, and respects reduced motion.
- [x] The assistant's first word arrives at least 1 s sooner than before, measured the same way both times. (1.2 s sooner to the model call, median of 8 runs each.)
- [ ] The lesson page's LCP from the development machine beats feature 23's 4.1 s baseline. Not shown: on a phone hotspot, even the old build measured 4.1–7.0 s. The same-session comparison is in the progress tracker.
- [ ] The e2e suite, unit tests, lint and `npm run build` pass. Unit tests, lint, `tsc`, the build and `check:secrets` pass. Of the e2e suite, only the perf project was run.
