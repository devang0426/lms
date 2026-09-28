# Feature 06: App shells and navigation

**Status:** Done (2026-09-25). Browser checks pending, see below.
**Depends on:** 03, 04
**Demo step:** 1, 4

## Goal

The layouts every screen lives in, with navigation by role.

## Scope

**In:**
- Route groups and layouts.
- Sidebar and top-bar shells.
- The mobile tab bar.
- The user menu.
- Role redirects.
- Placeholder pages.

**Out:** the real page content (later features).

## Routes

| Group | Layout | Nav items |
| ----- | ------ | --------- |
| `app/(student)/` | Sidebar shell: 248px, Oat background, logo, nav, notice card, user block | Home `/`, Explore `/catalog`, My courses `/courses`, Calendar `/calendar`, Discussions `/discussions`, Progress `/progress`, My space `/space` |
| `app/(instructor)/instructor/` | Sidebar shell with the "Teaching mode" sage badge | Overview, Courses, Learners, Analytics, Messages |
| `app/(admin)/admin/` | Sidebar shell | Users, Courses and enrollments, Terms, Audit log |
| Course detail | Top-nav shell: 72px header, "Back to Explore" | — |
| Lesson player | Focus shell: 68px header with back, course and module, progress, "Mark complete" | — |

## Implementation notes

- **Layouts are server components.** Each one calls `requireRole` and
  redirects on a mismatch:
  - A student visiting `/instructor` goes to `/`.
  - An admin can visit everything. Admin is also the demo instructor.
- **No "view as student" mode:** roles stay strict.
  - To show the student side, the demo switches **accounts** (feature 03).
  - Admin's sidebar has both an Instructor section and an Admin section.
- **Active nav item:** a small client component using `usePathname`.
- **Mobile:** below 768px the sidebar collapses. Students get the bottom
  `TabBar` (Home, Explore, Courses, Profile), as in the Mobile home
  wireframe.
- **User menu:** name, role, "Switch demo account" (demo mode), and sign
  out (Clerk `<SignOutButton>`).
- **Error pages:** `not-found.tsx`, `forbidden.tsx` (if enabled) and
  `error.tsx`, styled with `EmptyState`.

## Acceptance criteria

- [ ] The demo student lands on `/`. The demo admin lands on
      `/instructor`.
- [ ] The student gets redirected away from `/instructor` and `/admin`.
- [x] Every nav item routes to a styled placeholder page. No 404s
      (all 25 routes appear in the build output).
- [ ] The layout works at 390px wide with no horizontal scroll.
- [x] `npm run build` passes.

## As built

- Route groups: `app/(student)/` guards the student area, with three nested
  shell groups: `(sidebar)` (home and the nav pages, plus `/profile`),
  `(topnav)` (`/courses/[courseId]`) and `(focus)`
  (`/courses/[courseId]/lessons/[lessonId]`). Instructor and admin live in
  `app/(instructor)/instructor/` and `app/(admin)/admin/`.
- `requireAreaRole()` and `homePathFor()` in `lib/auth`: a role mismatch
  redirects to the user's own home (student `/`, staff `/instructor`).
  `/` itself sends staff to `/instructor`, which is how the demo admin
  lands there.
- Shell components are in `components/shell/`. Nav config (with icons)
  is a plain module that client components import, so no icon crosses the
  server/client boundary.
- The mobile tab bar's fourth tab, **Profile** (`/profile`), holds the
  account actions and links to Calendar, Discussions, Progress and My
  space, which don't fit in the tab bar. Staff get a menu button that
  opens the nav in a dialog.
- `forbidden.tsx` is not used: it needs the experimental `authInterrupts`
  flag. `/no-access` stays for `requireRole()`.
- The feature 01 token preview moved from `/` to `/dev/tokens`.

**Still to check in a browser:** the demo student lands on `/` and the
demo admin on `/instructor`; the student is redirected away from
`/instructor` and `/admin`; no horizontal scroll at 390px.
