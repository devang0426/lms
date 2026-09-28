import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/* Optimistic check only: send signed-out visitors to /sign-in. This is NOT
   authorization — every page, action and query still checks access in
   lib/auth and lib/db. */
/* /api/blob/upload is listed because Blob's upload-completed callback has
   no user session (Blob signs it); token requests are checked in the route. */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/blob/upload",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) await auth.protect();
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
