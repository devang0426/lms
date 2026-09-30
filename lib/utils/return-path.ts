/* Where to go after signing in (feature 34). Clerk sends a signed-out deep
   link to /sign-in?redirect_url=<the full URL>, and its own form returns
   there. The demo picker does the same through this check: only a page on
   this site, so a crafted link can't send someone elsewhere after they
   sign in. Anything else lands on "/", which sends each role home. */
export function safeReturnPath(raw: string | null | undefined, origin: string): string {
  if (!raw) return "/";
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin) return "/";
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Back to the sign-in or sign-up page would loop.
  return /^\/sign-(in|up)(\/|$)/.test(url.pathname) ? "/" : path;
}
