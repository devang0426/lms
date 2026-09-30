# Feature 34: Public landing page

**Status:** Done (2026-09-30). See the progress tracker's feature 34 entry.
**Depends on:** 28, 29 (for the Skeleton and loading patterns)
**Demo step:** before step 1
**Source:** gap found after the audit (2026-09-29).

## Goal

A signed-out visitor sees a page that explains what the institute offers
and how to get in, instead of being sent straight to a login form.

## What happens today

`proxy.ts` protects every route except `/sign-in`, `/sign-up`, the
webhooks and the upload callback. So opening the site while signed out goes
straight to `/sign-in`.

Nothing public describes:
- the institute;
- its courses;
- the features: video lectures with the cited assistant, flashcards, quizzes, podcasts;
- how to join.

The course catalog needs a login too. `architecture.md` → Auth: "visible to
every signed-in user".

## Scope change

This adds a public page. When it starts, add it to `project-overview.md`
(Features → Platform) and to the system boundaries in `architecture.md`.

The design source has no landing wireframe. Build it only from the tokens
in `ui-context.md`, in the style of the sign-in page's Clay hero panel.

## Scope

**In:**
- **A public landing page.** The sections are:
  1. **Hero:** the institute's name and tagline, a serif headline, and **Sign in** as the primary action. When demo mode is on, a secondary action is **Try the demo**, which opens the demo picker.
  2. **What students get:** three to five feature cards (lectures with a clickable transcript, an assistant that cites the exact moment, flashcards and quizzes, podcasts, private study space), using real screenshots or illustrations from the app.
  3. **Courses** (only if approved, see the decisions): published courses in the current term, showing the catalog fields only (title, summary, instructor, lesson count, length).
  4. **How to join:** "Your institute enrolls you. Check your email for an invitation, or contact the office." This matches the roster and invitation flow; there is no self-enrollment.
  5. **Footer:** contact details, and privacy and terms links (the pages can be simple).
- **Routing:**
  - `proxy.ts` sends signed-out visitors on `/` to the landing page (`/welcome`). The student home at `/` stays as it is.
  - Deep links to other pages still go to `/sign-in` and come back afterwards.
  - Signed-in visitors on `/welcome` go to their home.
- **Settings:** the institute's name, tagline and contact details come from environment variables checked in `lib/env.ts` (feature 24). Nothing is hard-coded: `ai-workflow-rules.md` says placeholders are data slots.
- **SEO basics:** a title and description, Open Graph tags with a share image, `robots.txt`, and a sitemap with only the public pages.
- **Speed:** the page is static, or cached for the catalog section, with no per-request database calls. Aim for an LCP under 1.5 s.
- **Mobile and accessibility:** it works at 390 px and passes the axe checks.

**Out:**
- A content management system for editing the page.
- A blog.
- Pricing or payments.
- Self-enrollment.
- An enquiry form that stores data. It would need spam protection and a privacy notice; it can come later.

## Decisions needed

1. **Public course list.** Should signed-out visitors see the course list? Today only signed-in users do. Recommended: **yes, catalog fields only**, so prospective students can see what's taught. Lessons and everything below them stay private.
   - *Taken as recommended (2026-09-30):* title, summary, instructor, lesson count and length, for up to 12 courses. The tiles aren't links.
2. **Institute details.** The name, tagline, contact details and logo to show.
   - *Still the owner's:* the settings exist (`INSTITUTE_*`), with placeholder values in `.env.local`. There's no logo: the Studyhall mark is used.

## Acceptance criteria

- [x] Signed out, `/` shows the landing page. Signed in, `/` shows the role's home as it does today.
- [x] A signed-out deep link (e.g. `/courses/…`) goes to sign-in and returns to that page afterwards (Clerk's form, and the demo picker through `safeReturnPath`).
- [x] Try the demo appears only when `DEMO_MODE=true` (read at build, like the rest of the static page).
- [x] The public list shows published courses in the current term with catalog fields only. The lesson and assistant routes still send visitors to sign-in.
- [x] The page makes no database call per request: 0 `[db]` lines over 20 requests with `DB_LOG=1` on `next start`. There's one call at build, and at most one per hourly regeneration.
- [x] LCP is under 1.5 s on a production build: 424–536 ms locally, enforced by the test.
- [x] The Open Graph tags (with a generated share image), `robots.txt` and sitemap are present.
- [x] The 390 px and axe checks pass. A Playwright test is added (`e2e/landing.spec.ts`, project `landing`).
- [x] `npm run build`, lint and tests pass.
