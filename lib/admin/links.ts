import "server-only";

/* Where an invitation's sign-up link lands (feature 22): this site's
   /sign-up, whose Clerk <SignUp /> accepts the invitation ticket. Built
   from the configured NEXT_PUBLIC_APP_URL (feature 24, S10), never from
   request headers, which a client can set. lib/env.ts checks the URL at
   startup. */
export function signUpUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set.");
  return new URL("/sign-up", base).toString();
}
