# Feature 07: Courses, modules, lessons

**Status:** Done (2026-09-25). Builder clicks still to check in a browser, see below.
**Depends on:** 06
**Demo step:** 1, 3

## Goal

Instructors can build a course structure and publish it. Enrollment
controls who can see it.

## Scope

**In:**
- The schema.
- Instructor course builder: CRUD, reorder, and draft/published.
- Enrollment by admin.
- The real access-check helpers.
- Seeding the demo course.

**Out:**
- Video (10).
- AI content (12).
- Documents (18).

## Schema

- `courses`: id, termId, code ("MATH 201"), title, subject, level,
  summary, outcomes (text[]), coverTint (`clay|sage|butter|stripe`),
  status, createdAt, updatedAt.
- `sections`: id, courseId, name ("Section A").
- `course_staff`: courseId, userId, role (`instructor | ta`).
- `enrollments`: sectionId, userId, status, enrolledAt.
- `modules`: id, courseId, position, title, status.
- `lessons`: id, moduleId, position, kind
  (`video | reading | quiz | assignment`), title, durationSec, status
  (`draft | processing | ready | published`), publishedAt.

## Files

- `lib/db/courses.ts`: scoped queries.
  - `listCoursesForStudent(userId)`
  - `listCoursesForStaff(userId)`
  - `getCourseForUser(courseId, userId)`
  - `getLessonForUser(lessonId, userId)`
  - Every query joins through `enrollments` or `course_staff`.
  - Students only see `status='published'`.
- `lib/auth`: implement `requireCourseStaff` and `requireEnrollment`.
- `app/(instructor)/instructor/courses/`:
  - List, new, and `[courseId]` builder.
  - The builder has modules and lessons as a sortable list, rename,
    add/delete, and a publish toggle per lesson and module.
- `app/(admin)/admin/courses/[courseId]/enrollments`: add or remove
  students (search users).
- Seed: `seedCourse()` in `scripts/seed.ts`:
  - **"MATH 201 · Linear Algebra"** (subject and course are open questions;
    change here).
  - One section, with the admin as instructor and the student enrolled.
  - Three modules with placeholder lessons.

## Implementation notes

- Mutations are server actions:
  1. zod input.
  2. `requireCourseStaff`.
  3. Write.
  4. Write `audit_log`.
  5. `revalidatePath`.
- Reordering uses `position` integers with a single batch update. No
  drag-and-drop library is needed: use up/down buttons for the demo.
- A course isn't visible to students until the course **and** the lesson are
  published.

## Acceptance criteria

- [ ] The admin can create a module and a lesson, reorder them, and
      publish.
- [x] The student sees the published lessons of their enrolled course only.
      Opening a draft or unenrolled lesson URL returns a 404. (Verified
      against the database: 22 access checks. The pages call `notFound()`
      when the query returns null.)
- [x] The seed creates the demo course with the right staff and enrollment.
      It is idempotent (second run keeps the curriculum).
- [x] `npm run build` passes.

## As built

- **Visibility:** a student sees a lesson only when the course, its
  **module** and the lesson are all published, and they have an active
  enrollment. The module check is added to the spec's "course and lesson".
- Migration `0002_courses_modules_lessons`. Course `status` and module
  `status` share the `publish_status` enum; lessons use `lesson_status`.
  `(term_id, code)` is unique per term.
- `lib/db/courses.ts`: `listCoursesForStudent`, `listCoursesForStaff`,
  `getCourseAccess`, `getCourseForUser`, `getLessonForUser`,
  `courseIdForModule/Lesson`. Admins count as staff on every course.
  Malformed ids return null instead of a database error.
- `lib/auth`: `requireCourseStaff` / `requireEnrollment` call `notFound()`
  so a URL never shows a draft exists. Server actions check
  `getCourseAccess()` and return `{ ok: false, error }` instead.
- Builder at `/instructor/courses/[courseId]`: Curriculum tab (modules and
  lessons with rename, add, delete with a confirm dialog, up/down,
  publish toggles) and Details tab (code, title, subject, level, summary,
  outcomes, cover). "Publish course" is the page's primary action.
  Creating a course adds "Section A" and the creator as instructor.
- Every mutation writes its `audit_log` row in the same `db.batch`.
  Reorders rewrite positions 0..n-1 in one batch, which also closes gaps
  after deletes.
- Unpublishing a lesson sets it back to `draft`. Feature 10 should send a
  processed video lesson back to `ready` instead.
- Enrollment: `/admin/courses` lists courses with student counts;
  `/admin/courses/[courseId]/enrollments` searches students (`?q=`) and
  adds or removes them. Removing sets `status = 'dropped'` (kept for
  audit), and re-adding reactivates the row.
- Seed: "MATH 201 · Linear Algebra", 3 modules and 8 placeholder lessons.
  Module 3 and the practice quiz stay drafts, so the demo shows what
  students can't see.

**Still to check in a browser:** as the demo admin, create a module and
a lesson, reorder them and publish; as the demo student, open the course
and a lesson.
