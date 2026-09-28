# Feature 02: Database and auth (Neon + Drizzle + Clerk)

**Status:** Done (2026-09-25). Two dashboard steps are left for you; see "Manual steps".
**Depends on:** 01
**Demo step:** 1, 4 (signing in)

## Goal

Signed-in users with a role, mirrored into Neon, plus the base schema and
the permission helpers that every later feature uses.

## Scope

**In:**
- Drizzle on Neon with pgvector enabled.
- Base tables.
- Clerk sign-in, `proxy.ts`, and the user-sync webhook.
- Role handling and the `lib/auth` helpers.

**Out:**
- Demo accounts and the seed (feature 03).
- Course content tables (feature 07).

## Files

- `lib/db/client.ts`: Drizzle client using the Neon serverless driver,
  `server-only`.
- `lib/db/schema.ts`: base tables.
- `drizzle.config.ts`: uses `DATABASE_URL_UNPOOLED`.
- `drizzle/`: migrations. The first migration runs
  `CREATE EXTENSION IF NOT EXISTS vector`.
- `proxy.ts`: `clerkMiddleware()`, which protects everything except
  `/sign-in` and `/api/webhooks/*`.
- `app/layout.tsx`: wrap the app in `<ClerkProvider>`.
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`: Clerk `<SignIn />`,
  restyled to the design tokens with Clerk `appearance`.
- `app/api/webhooks/clerk/route.ts`: `verifyWebhook`, then upsert or
  soft-delete in `users`.
- `lib/auth/index.ts`: `getCurrentUser()`, `requireUser()`,
  `requireRole(...roles)`, `requireCourseStaff(courseId)` and
  `requireEnrollment(courseId)`. The course checks are stubs until feature
  07 adds the tables.
- `types/globals.d.ts`: `CustomJwtSessionClaims`, so that
  `metadata.role` is typed.

## Schema (base)

- `users`: id (uuid), clerkId (unique), email, name, imageUrl, role
  (`admin | instructor | student`), createdAt, updatedAt, deletedAt.
- `terms`: id, name ("Autumn 2026"), startsOn, endsOn, isCurrent.
- `audit_log`: id, actorId, action, entityType, entityId, data (jsonb),
  createdAt.
- `ai_usage`: id, userId, feature, model, inputTokens, outputTokens,
  costUsd, createdAt. Created here and written from feature 09.

## Implementation notes

- **Role:**
  - The role lives in Clerk `publicMetadata.role`.
  - In the Clerk dashboard, add `{"metadata": "{{user.public_metadata}}"}`
    to the session token claims, so `auth().sessionClaims.metadata.role`
    works without a network call.
  - The webhook copies the role into `users.role`.
  - Data-layer checks use the Neon row. Clerk claims are only used for fast
    redirects.
- **New users:** a new Clerk user with no role gets `student`.
- **Webhook dev fallback:** the Clerk webhook can't reach localhost. So
  `getCurrentUser()` upserts the Neon row on first sight when the row is
  missing (lazy sync).
- **Clerk and Next 16:** read Clerk's Next.js quickstart for the current
  `proxy.ts` setup. Also read
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Error pages:** `requireRole` throws a 403 and redirects to a friendly
  "No access" page.

## Acceptance criteria

- [x] Signed-out visits to `/` redirect to `/sign-in` (307, verified).
- [ ] Signing up creates a `users` row with the `student` role, through the
      webhook or the lazy sync. The code is in place (`syncUserFromClerk`);
      it needs a browser sign-up to confirm.
- [ ] Changing `publicMetadata.role` in Clerk to `admin` gives admin on the
      next session. With the session-token claim this is instant; without
      it, it takes up to 10 minutes (periodic re-sync). Needs a browser to
      confirm.
- [x] `npm run db:migrate` works on the empty Neon database. The 4 tables
      exist and `vector` 0.8.6 is installed.
- [x] No Clerk secret or database URL appears in the client bundle. The only
      hit is Clerk's library code mentioning the env var name.
- [x] `npm run build` passes, and lint is clean on the new files.

## As built

- **Env names follow your `.env.local`:** `DATABASE_URL` is the **direct**
  connection (drizzle-kit migrations), and `DATABASE_URL_POOLED` is the
  **pooled** one (app runtime). `example.env` is updated to match.
- **Driver:** `drizzle-orm/neon-http`. It has no interactive transactions,
  so use `db.batch([...])` for atomic multi-statement writes. drizzle-kit
  migrates over a websocket on the direct URL.
- **Migrations:** `drizzle/0000_enable_pgvector.sql` (custom) and
  `drizzle/0001_base_schema.sql`. Scripts: `db:generate`, `db:migrate`,
  `db:studio`.
- **Clerk setup:** done by hand, following the current Clerk quickstart:
  `proxy.ts` for Next 16, `<ClerkProvider>` inside `<body>`, `await auth()`.
  Sign-in and sign-up URLs are passed in code, so no extra env vars.
  Styling is in `lib/auth/appearance.ts`: CSS-variable colors, token
  classes, and the `clerk` CSS layer ordered before Tailwind utilities in
  `globals.css`.
- **Sign-up page** at `/sign-up`. It's for development only; set the Clerk
  sign-up mode to *Restricted* before a real rollout.
- **Lazy sync:** `getCurrentUser()` upserts the Neon row when it's missing.
  It picks up role changes from session claims, or from a Clerk re-sync
  every 10 minutes. A user without a role gets `student`, which is written
  back to Clerk.
- **Course checks fail closed:** `requireCourseStaff` and
  `requireEnrollment` allow **admin only** until feature 07 adds the course
  tables.
- **`/no-access`** is the friendly 403 page. `requireRole` redirects there.
- **`tsconfig` exclude narrowed** from all of `lib/` to only the unported
  NitroAI files, so the new `lib/db` and `lib/auth` are type-checked.
- **The token preview at `/`** now requires sign-in and shows the signed-in
  user's name, email and role, with Clerk's `<UserButton>`.

## Manual steps (Clerk Dashboard)

1. **Session token claim** (recommended): Sessions → Customize session
   token → add `{"metadata": "{{user.public_metadata}}"}`. Role changes then
   apply on the next request.
2. **Webhook** (needed for deploys; optional locally):
   - Webhooks → Add endpoint → `https://<your-domain>/api/webhooks/clerk`.
   - Events: `user.created`, `user.updated`, `user.deleted`.
   - Copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.
   - Locally, lazy sync covers it, so no tunnel is needed.
