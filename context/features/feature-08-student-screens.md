# Feature 08: Student screens

**Status:** Done (2026-09-25). Visual check in a browser pending, see below.
**Depends on:** 07
**Demo step:** 4

## Goal

Student home, the catalog and course detail, built from the wireframes and
filled with real data.

## Scope

**In:**
- `/` Student home.
- `/catalog`.
- `/courses` (My courses).
- `/courses/[courseId]` (Course detail).

**Out:**
- The lesson player (11).
- Calendar data (21). Use an empty state until then.

## Screens

- **Student home** (wireframe 02):
  - Mono date eyebrow and "Good morning, *{firstName}*" (the greeting
    changes by time of day).
  - Search field.
  - "Continue learning" hero card: the last lesson watched, from
    `watch_progress` once feature 11 exists. Until then, the first
    unfinished lesson.
  - "Coming up" list (feature 21; empty state until then).
  - "Your courses" grid with In progress / Completed chips.
  - Butter "This week" notice in the sidebar.
- **Catalog** (wireframe 03):
  - All published courses in the current term, with subject chips and
    Level/Sort menus.
  - Courses the student isn't enrolled in show "Not enrolled". Enrollment
    is by roster, so there is no self-enroll button.
- **Course detail** (wireframe 04):
  - Eyebrow, serif title, summary, instructor, meta (lessons, total
    duration, level).
  - Primary button: "Start course", or "Continue" if already started.
  - Tabs: Curriculum (accordion with step indicators), Overview,
    Instructor.
  - "You'll be able to" outcomes panel.

## Implementation notes

- These are server components that read through `lib/db/courses.ts`.
  Search and filtering use URL `searchParams`, so there's no client state.
- Course cover: `coverTint` uses the stripe or tint placeholders. There
  are no images.
- The progress % is completed lessons ÷ published lessons. It is 0 until
  feature 11.

## Acceptance criteria

- [ ] As the demo student, all three screens match their wireframes and
      show seeded data.
- [x] Filters and search in the catalog work through the URL, so the back
      button works. (Every chip, menu item and the search form are links or
      GET forms; no client state.)
- [ ] The layout works on mobile (Mobile home wireframe for `/`).
- [x] `npm run build` passes.

## As built

- **Data:** `lib/db/catalog.ts` (`listCatalog`, `catalogFacets`,
  `getCatalogCourse`, `listEnrolledSummaries`, `firstLessons`,
  `listCourseInstructors`). Counts and lengths only include lessons whose
  module and lesson are both published. 22 query checks passed against
  the database (filters, LIKE escaping, enrolled flag, drafts hidden).
- **Catalog visibility (decision):** the catalog fields of a published
  course in the current term (title, summary, outcomes, instructor,
  counts, length) are visible to any signed-in user. The curriculum and
  lessons still need an enrollment. So a "Not enrolled" course opens a
  preview with no lesson titles or links and the note "Enrollment is by
  roster", not a 404.
- **Home:** the greeting and date use the browser's clock (client
  component; the server renders "Welcome back"). "Continue learning" is
  the first unfinished course's first published lesson until feature 11.
  "Coming up" is an empty state until feature 21. The search field
  submits to `/catalog?q=`. In progress / Completed chips use `?show=`.
  Below 768px: the Clay "Continue" card and the compact course list
  (Mobile home wireframe).
- **Catalog:** `?q`, `?subject`, `?level`, `?sort` (`newest`, `title`,
  `shortest`). Subject chips and Level/Sort menus are links.
- **Course detail:** "Start course" goes to the first lesson ("Continue"
  once progress exists). Tabs: Curriculum (accordion with step
  indicators and the "You'll be able to" panel), Overview, Instructor.
  The right-hand block plays lesson 1 instead of a trailer (there is no
  trailer feature).
- **Left out on purpose:** the notification button (feature 21), "Save
  for later", the "Saved" chip, "Reviews", "Certificate" and price. No
  feature defines them.
- Progress is completed ÷ published lessons, 0 until feature 11
  (`components/student/course-view.ts` is the one place to change).

**Still to check in a browser:** as the demo student, the three screens
against wireframes 02–04 and `/` at 390px against wireframe 07.
