# Feature 22: Dashboards and admin

**Status:** Not started
**Depends on:** 20, 21
**Demo step:** 1

## Goal

The Instructor dashboard (wireframe 06) with real numbers, and the admin
screens needed to run the university.

## Scope

**In:**
- Instructor overview stats.
- Courses table.
- The "Needs grading" list.
- Simple analytics.
- Admin users, roles, enrollments, terms, audit log and CSV roster import.

**Out:**
- SIS sync.
- Advanced reporting.

## Files

- `/instructor` (wireframe 06):
  - Stat cards:
    - **Active learners:** students with activity in the last 7 days.
    - **Avg. completion.**
    - **Waiting for grading:** butter "attention" card.
    - **Unanswered questions.**
  - Courses table (status badge, learners, completion bar).
  - "Needs grading" list.
- `/instructor/analytics`:
  - Per lecture: a watch heat-strip from the `watchedRanges` totals (where
    students re-watch or drop off).
  - Most-asked assistant topics, grouped by chapter, with no student names.
  - Refusal rate.
  - AI cost per feature, from `ai_usage`.
- `/admin/users`:
  - List and search.
  - Change the role, which updates Clerk `publicMetadata` and Neon.
  - Invite (Clerk invitation).
- `/admin/roster`: CSV import (`email,name,role,course_code,section`) with
  a preview, validation errors per row, then apply. Creates Clerk
  invitations and enrollments.
- `/admin/terms`, `/admin/audit`: a filterable audit log.

## Acceptance criteria

- [ ] With seeded data, the dashboard numbers match the database, checked
      by hand.
- [ ] The analytics heat-strip shows the demo student's watched ranges.
- [ ] A CSV with 1 bad row imports the good rows and reports the bad one.
- [ ] Role changes appear in the audit log.
- [ ] `npm run build` passes.
