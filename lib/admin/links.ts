import "server-only";

import { headers } from "next/headers";

/* Where an invitation's sign-up link lands (feature 22): this site's
   /sign-up, whose Clerk <SignUp /> accepts the invitation ticket. Read
   from the request, so it's right on localhost, previews and production. */
export async function signUpUrl(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${origin}/sign-up`;
}
