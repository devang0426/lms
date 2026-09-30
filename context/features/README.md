# Feature Specs

Build Studyhall one feature file at a time, **in order**.

Each file lists:
- the feature's goal
- what's in and out of scope
- the files it touches
- implementation notes
- acceptance criteria that must pass before moving on

Follow `../ai-workflow-rules.md`. When a feature is done:

1. Set its **Status** to `Done`.
2. Record it in `../progress-tracker.md`.
3. Update any context file the feature changed.

## Demo accounts

Feature 03 creates these accounts. The seed script sets them up, and they
appear on the sign-in page when `DEMO_MODE=true`.

| Account | Email (Clerk test address) | Role | Used for |
| ------- | -------------------------- | ---- | -------- |
| **Demo Admin**: "Prof. Meera Rao" | `demo.admin+clerk_test@example.com` | `admin`, and also listed as the **instructor** of the demo course | Instructor dashboard, upload, review and publish, grading, admin screens |
| **Demo Student**: "Aanya Sharma" | `demo.student+clerk_test@example.com` | `student`, enrolled in the demo course | Student home, lesson player, assistant, study tools, private space, submitting work |

The password for both is `DEMO_ACCOUNT_PASSWORD` in `.env.local`. The
one-click picker does not need it.

## Order

| # | Feature | Demo step |
| - | ------- | --------- |
| 01 | [Design system CSS](feature-01-design-system-css.md) | all |
| 02 | [Database and auth (Neon + Drizzle + Clerk)](feature-02-database-and-auth.md) | 1, 4 |
| 03 | [Demo accounts and seed](feature-03-demo-accounts-and-seed.md) | 1, 4 |
| 04 | [UI components](feature-04-ui-components.md) | all |
| 05 | [Port NitroAI `lib/`](feature-05-port-nitro-lib.md) | — |
| 06 | [App shells and navigation](feature-06-app-shells.md) | 1, 4 |
| 07 | [Courses, modules, lessons](feature-07-courses-modules-lessons.md) | 1, 3 |
| 08 | [Student screens](feature-08-student-screens.md) | 4 |
| 09 | [Storage, jobs and AI runtime](feature-09-storage-jobs-ai-runtime.md) | 2 |
| 10 | [Video upload and processing](feature-10-video-upload-processing.md) | 2 |
| 11 | [Lesson player](feature-11-lesson-player.md) | 5 |
| 12 | [AI lesson content and review](feature-12-ai-lesson-content.md) | 2, 3 |
| 13 | [Indexing and retrieval](feature-13-indexing-retrieval.md) | 6 |
| 14 | [Course assistant](feature-14-course-assistant.md) | 6 |
| 15 | [Flashcards](feature-15-flashcards.md) | 7 |
| 16 | [Quizzes and mastery](feature-16-quizzes.md) | 7 |
| 17 | [Podcast](feature-17-podcast.md) | 7 |
| 18 | [Document ingest](feature-18-document-ingest.md) | 3, 8 |
| 19 | [Student private space](feature-19-student-private-space.md) | 8 |
| 20 | [Assignments and grading](feature-20-assignments-grading.md) | 9 |
| 21 | [Calendar, announcements, discussions, notifications](feature-21-communication.md) | 4, 6 |
| 22 | [Dashboards and admin](feature-22-dashboards-admin.md) | 1 |
| 23 | [Hardening and demo polish](feature-23-hardening-demo-polish.md) | all |

### Production readiness (features 24–33)

These features come from the production-readiness audit in `report.md` at
the repo root (2026-09-29). Each spec names the finding IDs it fixes.

They are **software-only**. While the app runs on free tiers, none of them
changes infrastructure or plans. The infrastructure items are listed in
`../progress-tracker.md` under "Deferred until paid plans".

| # | Feature | Priority |
| - | ------- | -------- |
| 24 | [Security lockdown](feature-24-security-lockdown.md) | P0 |
| 25 | [AI spend guardrails](feature-25-ai-spend-guardrails.md) | P0 |
| 26 | [Job recovery and clean-up](feature-26-job-recovery-cleanup.md) | P0 |
| 27 | [Course-building flow (instructor)](feature-27-course-building-flow.md) | P1 |
| 28 | [Navigation and wayfinding](feature-28-navigation-wayfinding.md) | P1 |
| 29 | [Performance (software only)](feature-29-performance.md) | P1 |
| 30 | [Error handling and resilience](feature-30-error-handling-resilience.md) | P1 |
| 31 | [Learners and progress pages](feature-31-learners-progress.md) | P1 |
| 32 | ~~[Private messages](feature-32-private-messages.md)~~ | Parked: removed from the plan for now (2026-09-30) |
| 33 | [Data export and account deletion](feature-33-data-export-deletion.md) | P1 |
| 34 | [Public landing page](feature-34-landing-page.md) | new |
| 35 | [Course deletion](feature-35-course-deletion.md) | new (owner's request, 2026-09-30) |

Features 24, 25 and 26 come first: fix them before anyone outside the
team gets the URL. Feature 29 depends only on 24, so it can run alongside
27 and 28.

The seed script from feature 03 **grows with later features**. Feature 07
adds the demo course. Feature 12 adds a pre-processed lecture. Feature 20
adds an assignment with a submission. With all of that, the demo can run
from a fresh database with a single command.
