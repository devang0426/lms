import { z } from "zod";

/* Every environment variable the Next.js app reads (feature 24), checked
   once at startup by instrumentation.ts → register(). A missing or
   malformed required variable stops the server with one message that
   names all of them, instead of failing later on first use (a video stuck
   in "processing" without the Trigger key, "The upload couldn't be
   started" without the Blob token).

   Pure (no `server-only`): the unit tests import it, and it holds no
   values of its own. Only server code calls it. example.env documents
   each variable; Trigger.dev tasks read their own copies from the
   Trigger.dev dashboard and aren't checked here. */

type Env = Record<string, string | undefined>;

const text = z.string().trim().min(1);
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// connection URL" });
const prefixed = (prefix: RegExp, what: string) => text.regex(prefix, `doesn't look like ${what}`);

/* The public host of this app's Blob store, e.g. abc123.public.blob.vercel-storage.com.
   The CSP (next.config.ts) allows only this host. */
export const BLOB_PUBLIC_HOST_RE = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

export const ENV_VARS = {
  // App
  NEXT_PUBLIC_APP_URL: { required: true, schema: z.url({ protocol: /^https?$/, error: "must be an http(s) URL, e.g. https://studyhall.example.edu" }) },
  DEMO_MODE: { required: false, schema: z.enum(["true", "false"], { error: 'must be "true" or "false"' }) },
  DEMO_ACCOUNT_PASSWORD: { required: false, schema: text },
  DEMO_PASSCODE: { required: false, schema: text.min(8, "must be at least 8 characters") },
  DEMO_DB_HOSTS: { required: false, schema: text },
  VERCEL_ENV: { required: false, schema: z.enum(["production", "preview", "development"]) },
  // Neon
  DATABASE_URL: { required: true, schema: postgresUrl },
  DATABASE_URL_POOLED: { required: false, schema: postgresUrl },
  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: { required: true, schema: prefixed(/^pk_(test|live)_/, "a Clerk publishable key (pk_…)") },
  CLERK_SECRET_KEY: { required: true, schema: prefixed(/^sk_(test|live)_/, "a Clerk secret key (sk_…)") },
  CLERK_WEBHOOK_SIGNING_SECRET: { required: true, schema: prefixed(/^whsec_/, "a Clerk webhook signing secret (whsec_…)") },
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: { required: false, schema: text },
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: { required: false, schema: text },
  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: { required: true, schema: prefixed(/^vercel_blob_rw_[A-Za-z0-9]+_/, "a Vercel Blob read-write token") },
  BLOB_PUBLIC_HOST: { required: true, schema: text.regex(BLOB_PUBLIC_HOST_RE, "must be the store's host, e.g. abc123.public.blob.vercel-storage.com") },
  // Trigger.dev
  TRIGGER_SECRET_KEY: { required: true, schema: prefixed(/^tr_[a-z]+_/, "a Trigger.dev secret key (tr_…)") },
  TRIGGER_PROJECT_REF: { required: false, schema: text },
  // AI
  OPENROUTER_API_KEY: { required: true, schema: text },
  ASSISTANT_MIN_SIMILARITY: { required: false, schema: z.coerce.number().gt(0).lt(1) },
  VIDEO_MAX_MINUTES: { required: false, schema: z.coerce.number().positive() },
  // The daily AI limit per person (feature 25, lib/ai/budget.ts)
  AI_DAILY_CALLS_STUDENT: { required: false, schema: z.coerce.number().int().positive() },
  AI_DAILY_USD_STUDENT: { required: false, schema: z.coerce.number().positive() },
  AI_DAILY_CALLS_STAFF: { required: false, schema: z.coerce.number().int().positive() },
  AI_DAILY_USD_STAFF: { required: false, schema: z.coerce.number().positive() },
  DOCUMENT_MAX_MINUTES: { required: false, schema: z.coerce.number().positive() },
  // Local ffmpeg for `trigger dev`
  FFMPEG_PATH: { required: false, schema: text },
  // The query counter (feature 29, lib/db/query-log.ts)
  DB_LOG: { required: false, schema: z.enum(["0", "1"], { error: 'must be "1" (on) or "0"' }) },
  FFPROBE_PATH: { required: false, schema: text },
  // The institute on the public pages (feature 34, lib/institute.ts)
  INSTITUTE_NAME: { required: true, schema: text.max(80, "must be at most 80 characters") },
  INSTITUTE_TAGLINE: { required: false, schema: text.max(160, "must be at most 160 characters") },
  INSTITUTE_EMAIL: { required: false, schema: z.email({ error: "must be an email address, e.g. office@university.edu" }) },
  INSTITUTE_PHONE: { required: false, schema: text.regex(/^\+?[\d\s().-]{6,24}$/, "must be a phone number, e.g. +91 22 1234 5678") },
  INSTITUTE_ADDRESS: { required: false, schema: text.max(200, "must be at most 200 characters") },
} satisfies Record<string, { required: boolean; schema: z.ZodType }>;

export type EnvCheck = { ok: true } | { ok: false; problems: string[] };

const set = (env: Env, name: string): string | undefined => {
  const v = env[name]?.trim();
  return v ? v : undefined;
};

/* The Blob store id is the token's fourth part: vercel_blob_rw_<storeId>_<secret>. */
export function blobStoreHost(token: string): string | null {
  const id = token.split("_")[3];
  return id ? `${id.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/* Demo mode is on a production deployment only behind a passcode (S1). */
export function demoPasscodeRequired(env: Env): boolean {
  return set(env, "DEMO_MODE") === "true" && set(env, "VERCEL_ENV") === "production";
}

export function checkEnv(env: Env): EnvCheck {
  const problems: string[] = [];

  for (const [name, rule] of Object.entries(ENV_VARS)) {
    const value = set(env, name);
    if (value === undefined) {
      if (rule.required) problems.push(`${name} is missing`);
      continue;
    }
    const parsed = rule.schema.safeParse(value);
    if (!parsed.success) problems.push(`${name} ${parsed.error.issues[0]?.message ?? "is invalid"}`);
  }

  // Rules across variables.
  if (set(env, "DEMO_MODE") === "true" && !set(env, "DEMO_ACCOUNT_PASSWORD")) {
    problems.push("DEMO_ACCOUNT_PASSWORD is missing (needed while DEMO_MODE=true)");
  }
  // "How to join" sends visitors without an invitation to the office.
  if (!set(env, "INSTITUTE_EMAIL") && !set(env, "INSTITUTE_PHONE")) {
    problems.push("INSTITUTE_EMAIL or INSTITUTE_PHONE is needed: the landing page tells visitors how to contact the office");
  }
  if (demoPasscodeRequired(env) && !set(env, "DEMO_PASSCODE")) {
    problems.push("DEMO_PASSCODE is missing: DEMO_MODE=true on a production deployment needs a passcode");
  }
  const token = set(env, "BLOB_READ_WRITE_TOKEN");
  const host = set(env, "BLOB_PUBLIC_HOST");
  const tokenHost = token ? blobStoreHost(token) : null;
  if (host && tokenHost && BLOB_PUBLIC_HOST_RE.test(host) && host !== tokenHost) {
    problems.push(`BLOB_PUBLIC_HOST is ${host}, but BLOB_READ_WRITE_TOKEN belongs to the store at ${tokenHost}`);
  }

  return problems.length ? { ok: false, problems } : { ok: true };
}

/* Called by instrumentation.ts at server start. Exiting beats throwing:
   a throw leaves `next start` running, answering every request with a
   500 and repeating the stack trace. */
export function exitOnBadEnv(env: Env = process.env): void {
  const result = checkEnv(env);
  if (result.ok) return;
  console.error(envErrorMessage(result.problems));
  process.exit(1);
}

export function envErrorMessage(problems: string[]): string {
  return [
    `Studyhall can't start: ${problems.length === 1 ? "an environment variable needs" : `${problems.length} environment variables need`} fixing (see example.env).`,
    ...problems.map((p) => `  - ${p}`),
  ].join("\n");
}
