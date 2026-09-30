# Feature 28: Navigation and wayfinding

**Status:** Done (2026-09-30). Details are in `../progress-tracker.md` under Completed.
**Depends on:** 27
**Demo step:** all
**Source:** `report.md` (production-readiness audit, 2026-09-29): N3, N4,
N5, N6, N9, N10.

## Goal

Every role can tell where they are, get back, and reach each tool within
two clicks, on desktop and on a phone.

## Scope

**In:**
- "View as student" for staff, and correct exits from preview.
- Breadcrumbs.
- Course quick links for students.
- One name per page.
- The phone tab bar, and the lesson player's header.
- Hiding pages that aren't built yet.
- Links in the admin area.

**Out:**
- New pages: Learners and Progress are feature 31, and private messages are feature 32.
- A visual redesign.

## Tasks

1. **Student view for staff** (N3):
   - Add **View as student** to the staff sidebar footer and the user menu. It opens the course page of a course they teach.
   - The `(topnav)` layout (`app/(student)/(topnav)/layout.tsx:7`) admits a course's staff to that course's student pages. It currently allows only students and admins, so instructors are bounced to `/instructor`.
   - Show a "Student view" banner with a "Back to Teaching" link.
   - In the lesson player's preview, "Back to course" (`(focus)/…/page.tsx:190-191`) goes somewhere the viewer can open.
   - Student Home (`(sidebar)/page.tsx:24-25`) still sends staff to `/instructor`, but no longer without explanation: the sidebar's Home item for staff is labelled "Teaching home".
2. **Admin area:**
   - Add a Teaching / Admin switch at the top of the sidebar.
   - Hide the "Teaching mode" badge while in the Admin section.
   - Course titles on `/admin/courses` link to the course builder (`app/(admin)/admin/courses/page.tsx:30-45`).
3. **Course page** (N4, `components/shell/top-nav-shell.tsx:27-33`):
   - The top bar becomes a breadcrumb: "My courses › MATH 201" for enrolled students, "Explore › …" otherwise.
   - "My learning" stays visible on phones.
   - The course page gets quick links: Discussions, Grades, Flashcards (`/study?course=`), Calendar and Assistant.
4. **Staff breadcrumbs:** course builder, lesson editor, review, new graded quiz, gradebook and the grading item.
5. **Staff tools** (N5):
   - The Grading empty state links to the course list, with "Set an assignment: add an Assignment lesson".
   - The gradebook becomes a visible button on the course page.
6. **Labels** (N6):
   - "My courses" everywhere; today it's also "My learning" and "Courses".
   - "Explore" everywhere; some empty states say "catalog".
   - The teacher's "Messages" becomes **"Questions"**, because it's the course Q&A. Feature 32 brings back "Messages" for private messages.
   - The student "Study" item becomes **"Flashcards"**, which is all it holds (decision below).
   - The nav lives in `components/shell/nav-config.ts`.
7. **Phones** (N9):
   - The student tab bar becomes Home, Courses, Flashcards and **More**.
   - More opens a sheet with Explore, Calendar, Discussions, Grades, My space and Profile.
   - The lesson player's header gets the user menu and the notification bell.
8. **Unbuilt pages** (N10): remove **Learners** and **Progress** from the nav until feature 31 builds them. Their pages are placeholders today.

## Decision needed

- **The student "Study" item.** Recommended: rename it **"Flashcards"** now. The alternative is to turn Study into a hub for due cards, quizzes and podcasts across courses. **Decided (2026-09-30): renamed "Flashcards", as recommended.**

## Acceptance criteria

- [x] An "As built" table lists every nav item per role and its target. None leads to a placeholder. (`ui-context.md` → Navigation; `nav-config.test.ts` checks it.)
- [x] An instructor who isn't an admin can View as student, open a lesson in preview, and every back link lands on a page they can open. (Checked over HTTP with a temporary instructor.)
- [x] On a 390 px phone, every student page is reachable in 2 taps or fewer. Extend `e2e/mobile.spec.ts`.
- [x] The breadcrumbs appear on the listed pages.
- [x] The axe checks in `e2e/a11y.spec.ts` still pass (and now cover the course page and Student view).
- [x] `npm run build`, lint and tests pass.
