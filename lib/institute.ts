/* The institute the public pages describe (feature 34): the landing page,
   its share image, and the privacy and terms pages. Every value comes from
   the environment (lib/env.ts checks them when the server starts), never
   from code: placeholders are data slots (ai-workflow-rules.md).

   Pure (no `server-only`): the unit tests import it. The public pages are
   static, so these are read when the page is built (`next build`, or an
   hourly regeneration), not per request. */

type Env = Record<string, string | undefined>;

export interface Institute {
  name: string;
  tagline: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

const value = (env: Env, name: string): string | null => env[name]?.trim() || null;

/* The build fails here, naming the variable, rather than baking a page
   with no institute into the static HTML. `next build` doesn't run the
   startup check, so this is where a build without it stops. */
export function institute(env: Env = process.env): Institute {
  const name = value(env, "INSTITUTE_NAME");
  if (!name) throw new Error("INSTITUTE_NAME is not set (see example.env). The public pages need it.");
  return {
    name,
    tagline: value(env, "INSTITUTE_TAGLINE"),
    email: value(env, "INSTITUTE_EMAIL"),
    phone: value(env, "INSTITUTE_PHONE"),
    address: value(env, "INSTITUTE_ADDRESS"),
  };
}

/* An absolute URL on this deployment, for the sitemap, robots.txt and the
   share image. Built from NEXT_PUBLIC_APP_URL, never from request headers. */
export function siteUrl(path = "/", env: Env = process.env): string {
  const base = value(env, "NEXT_PUBLIC_APP_URL");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set (see example.env). The public pages need it.");
  return new URL(path, base).toString();
}

/* "+91 22 1234 5678" → "tel:+912212345678". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/* The public pages. The sitemap lists exactly these, and robots.txt lets
   crawlers reach only these (plus "/", which sends a visitor here). */
export const PUBLIC_PAGES = ["/welcome", "/privacy", "/terms"] as const;
