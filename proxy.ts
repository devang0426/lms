import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/* Optimistic check only: send signed-out visitors to /sign-in. This is NOT
   authorization — every page, action and query still checks access in
   lib/auth and lib/db. */
/* /api/blob/upload is listed because Blob's upload-completed callback has
   no user session (Blob signs it); token requests are checked in the route.
   The landing page (feature 34) is public too: static, with nothing below
   the catalog fields of a course. */
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)", "/api/blob/upload", "/welcome"]);

const clerk = clerkMiddleware(
  async (auth, req) => {
    const path = req.nextUrl.pathname;
    // "/" is the student home when signed in, and the landing page when
    // not. Signed-in visitors on the landing page go home ("/" sends
    // staff on to /instructor). Any other page still goes to /sign-in and
    // comes back afterwards (auth.protect adds the redirect_url).
    if (path === "/" || path === "/welcome") {
      const { userId } = await auth();
      if (path === "/" && !userId) return NextResponse.redirect(new URL("/welcome", req.url));
      if (path === "/welcome" && userId) return NextResponse.redirect(new URL("/", req.url));
      return;
    }
    if (!isPublicRoute(req)) await auth.protect();
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

/* True when the request carries no Clerk session cookie at all
   (`__client_uat` is "0" once signed out; names may carry a suffix). */
function noClerkSession(req: NextRequest): boolean {
  return !req.cookies
    .getAll()
    .some(({ name, value }) => /^__session(_|$)/.test(name) || (/^__client_uat(_|$)/.test(name) && value !== "0"));
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname;
  // The public pages (feature 34) are static and read no session. On
  // Clerk's development instance (the demo deployment), Clerk would first
  // send a cookieless request round its "dev browser" handshake: two trips
  // to Clerk on a first visit, and an endless loop for a crawler or a link
  // preview. So privacy and terms skip Clerk, and so does the landing page
  // for a visitor with no session. "/" always asks Clerk, so no signed-in
  // user is ever kept from their home.
  if (path === "/privacy" || path === "/terms") return NextResponse.next();
  if (path === "/welcome" && noClerkSession(req)) return NextResponse.next();
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search
    // params. Also robots.txt, the sitemap and the landing page's share
    // image (feature 34): static, public, and read by crawlers without
    // cookies (see above).
    "/((?!_next|welcome/opengraph-image|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
