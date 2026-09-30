# Feature 31: Learners and progress pages

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 28, 29
**Demo step:** 1, 4
**Source:** `report.md` (production-readiness audit, 2026-09-29): N5 and
N10. Also the tracker's open question: "The Learners page isn't in any
feature spec".

## Goal

Teachers can see who is in their course and how each student is doing.
Students can see their own progress.

Today both pages are placeholders:
- `app/(instructor)/instructor/learners/page.tsx`
- `app/(student)/(sidebar)/progress/page.tsx`

Feature 28 hides them from the nav until this feature is done.

## Scope

**In:**
- **Teachers** (`/instructor/learners`, plus a **Students** tab on each course):
  - A table per course with each student's name, section and last activity.
  - Lessons completed out of lessons published.
  - Average quiz score.
  - Assignments handed in, graded and missing.
  - A CSV export, using `lib/coursework/csv.ts`.
  - Clicking a student opens their course report: per-lesson completion, quiz mastery per topic, and grades.
- **Students** (`/progress`):
  - Per course: completion, lessons watched, mastery per topic (`lib/study/mastery.ts`), and grades so far.
  - A "next up" suggestion.

**Out:**
- Parent accounts.
- Rankings or leaderboards.
- Anything from a student's private space or assistant chats.

## Notes

- **Data:** everything comes from existing tables: `enrollments`, `watch_progress`, `quiz_attempts`, `submissions`/`grades`, `card_reviews` and `lessons`. No new tables.
- **Access in SQL:**
  - Staff see students in their own courses only (`staffPredicate`), and admins see all.
  - A student sees only their own rows.
- **Reuse:** the completion rules from `lib/dashboard/stats.ts` (feature 22), so the numbers match the dashboard.
- **Speed:** each page is one `db.batch` after the access check, as in feature 29.

## Decision needed

- **Should teachers see how many assistant questions a student asked?** Recommended: **no**. Analytics already shows topics without names, and the assistant is meant to feel private.
  - **Taken as recommended (2026-09-30):** no. The owner asked for the feature as specified. Nothing on these pages reads `chat_threads` or `chat_turns`, and "last activity" leaves questions to the assistant out too. The Learners page says so.

## Acceptance criteria

- [x] For the demo student, every number matches hand-written SQL. (`verify31.ts` against the dev DB, 34 checks: completion, quiz attempts and average, handed in, graded, missing, last activity, sections, per-lesson states, mastery per topic, grades, `/progress` and the next-up pick. It includes a watched draft lesson, which isn't counted, and an unsubmitted attempt, which isn't averaged. The course average equals the dashboard's.)
- [x] An instructor sees only their courses' students. Another instructor's course returns 404. (A temporary real instructor of HISTORY101 only, over HTTP on a production build: their Learners showed only HISTORY101. MATH 201's report and builder were not found, and its CSV was a 404.)
- [x] A student sees only their own progress. (The loader takes no student id: it reads the viewer's own rows. Two temporary students' `/progress` showed only their own work, and the demo student's numbers didn't change. Students are sent home from the staff pages, and the CSV is a 404 for them.)
- [x] The CSV opens safely in Excel (formula-safe). (`lib/coursework/csv.ts`: BOM, CRLF, `'`-prefixed formulas. Unit tested with a `=HYPERLINK(…)` name, and checked in the downloaded file.)
- [x] Learners and Progress are back in the nav. (Learners in the teaching sidebar, Progress in the student sidebar and the phone's More sheet. `nav-config.test.ts`.)
- [x] axe checks pass on both pages. (`e2e/a11y.spec.ts` now covers `/progress`, `/instructor/learners` and a student report: 3/3 passed.)
- [x] `npm run build`, lint and tests pass. (61 files, 543 tests.)
