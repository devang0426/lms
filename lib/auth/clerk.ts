import "server-only";

import { createClerkClient } from "@clerk/backend";

/* Clerk's Backend API with the secret key. Plain @clerk/backend (not the
   Next.js wrapper), so the modules that use it also run in scripts and
   Trigger.dev tasks. Server-only. */

let client: ReturnType<typeof createClerkClient> | null = null;

export function clerkBackend() {
  client ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return client;
}
