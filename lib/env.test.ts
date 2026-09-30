import { describe, expect, it } from "vitest";
import { blobStoreHost, checkEnv, demoPasscodeRequired, ENV_VARS, envErrorMessage } from "./env";

/* A complete, valid set of the required variables (fake values). */
const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=require",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_abc",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_AbC123_secret",
  BLOB_PUBLIC_HOST: "abc123.public.blob.vercel-storage.com",
  TRIGGER_SECRET_KEY: "tr_dev_abc",
  OPENROUTER_API_KEY: "sk-or-v1-abc",
  INSTITUTE_NAME: "Northfield University",
  INSTITUTE_EMAIL: "office@northfield.example.edu",
};

const problems = (env: Record<string, string | undefined>) => {
  const r = checkEnv(env);
  return r.ok ? [] : r.problems;
};

describe("checkEnv (feature 24)", () => {
  it("accepts a complete set, with the optional ones left out", () => {
    expect(checkEnv(base)).toEqual({ ok: true });
  });

  it("names every missing required variable at once", () => {
    const required = Object.entries(ENV_VARS).filter(([, r]) => r.required).map(([n]) => n);
    const found = problems({}).filter((p) => p.endsWith(" is missing"));
    expect(found).toHaveLength(required.length);
    for (const name of required) expect(found).toContain(`${name} is missing`);
    // An empty value counts as missing.
    expect(problems({ ...base, OPENROUTER_API_KEY: "  " })).toEqual(["OPENROUTER_API_KEY is missing"]);
  });

  it("puts every problem in one message", () => {
    const { TRIGGER_SECRET_KEY: _t, BLOB_READ_WRITE_TOKEN: _b, ...rest } = base;
    expect(envErrorMessage(problems(rest))).toBe(
      [
        "Studyhall can't start: 2 environment variables need fixing (see example.env).",
        "  - BLOB_READ_WRITE_TOKEN is missing",
        "  - TRIGGER_SECRET_KEY is missing",
      ].join("\n"),
    );
    expect(envErrorMessage(["X is missing"])).toMatch(/^Studyhall can't start: an environment variable needs fixing/);
  });

  it("checks formats", () => {
    expect(problems({ ...base, NEXT_PUBLIC_APP_URL: "localhost:3000" })).toHaveLength(1);
    expect(problems({ ...base, DATABASE_URL: "mysql://x" })[0]).toMatch(/^DATABASE_URL /);
    expect(problems({ ...base, CLERK_SECRET_KEY: "pk_test_abc" })[0]).toMatch(/^CLERK_SECRET_KEY /);
    expect(problems({ ...base, DEMO_MODE: "yes" })[0]).toMatch(/^DEMO_MODE /);
    expect(problems({ ...base, ASSISTANT_MIN_SIMILARITY: "1.5" })[0]).toMatch(/^ASSISTANT_MIN_SIMILARITY /);
    // The daily AI limit and the document length cap (feature 25).
    expect(problems({ ...base, AI_DAILY_CALLS_STUDENT: "1.5" })[0]).toMatch(/^AI_DAILY_CALLS_STUDENT /);
    expect(problems({ ...base, AI_DAILY_USD_STAFF: "0" })[0]).toMatch(/^AI_DAILY_USD_STAFF /);
    expect(problems({ ...base, DOCUMENT_MAX_MINUTES: "ninety" })[0]).toMatch(/^DOCUMENT_MAX_MINUTES /);
    expect(problems({ ...base, AI_DAILY_CALLS_STUDENT: "150", AI_DAILY_USD_STUDENT: "0.25", DOCUMENT_MAX_MINUTES: "90" })).toEqual([]);
    expect(problems({ ...base, BLOB_PUBLIC_HOST: "*.public.blob.vercel-storage.com" })[0]).toMatch(/^BLOB_PUBLIC_HOST /);
  });

  it("requires the Blob host to be the token's own store (S8)", () => {
    expect(blobStoreHost(base.BLOB_READ_WRITE_TOKEN)).toBe("abc123.public.blob.vercel-storage.com");
    expect(problems({ ...base, BLOB_PUBLIC_HOST: "other9.public.blob.vercel-storage.com" })).toEqual([
      "BLOB_PUBLIC_HOST is other9.public.blob.vercel-storage.com, but BLOB_READ_WRITE_TOKEN belongs to the store at abc123.public.blob.vercel-storage.com",
    ]);
  });

  describe("the institute on the public pages (feature 34)", () => {
    it("needs a name, and an email or a phone for the office", () => {
      const { INSTITUTE_NAME: _n, ...noName } = base;
      expect(problems(noName)).toEqual(["INSTITUTE_NAME is missing"]);
      const { INSTITUTE_EMAIL: _e, ...noContact } = base;
      expect(problems(noContact)).toEqual([
        "INSTITUTE_EMAIL or INSTITUTE_PHONE is needed: the landing page tells visitors how to contact the office",
      ]);
      expect(checkEnv({ ...noContact, INSTITUTE_PHONE: "+91 22 1234 5678" })).toEqual({ ok: true });
    });

    it("checks formats", () => {
      expect(problems({ ...base, INSTITUTE_EMAIL: "office" })[0]).toMatch(/^INSTITUTE_EMAIL /);
      expect(problems({ ...base, INSTITUTE_PHONE: "call us" })[0]).toMatch(/^INSTITUTE_PHONE /);
      expect(problems({ ...base, INSTITUTE_NAME: "x".repeat(81) })[0]).toMatch(/^INSTITUTE_NAME /);
      expect(problems({ ...base, INSTITUTE_TAGLINE: "Learning that stays.", INSTITUTE_ADDRESS: "1 College Road, Pune" })).toEqual([]);
    });
  });

  describe("demo mode (S1)", () => {
    const demo = { ...base, DEMO_MODE: "true", DEMO_ACCOUNT_PASSWORD: "pw-for-demo" };

    it("refuses to start in production without a passcode", () => {
      expect(demoPasscodeRequired({ ...demo, VERCEL_ENV: "production" })).toBe(true);
      expect(problems({ ...demo, VERCEL_ENV: "production" })).toEqual([
        "DEMO_PASSCODE is missing: DEMO_MODE=true on a production deployment needs a passcode",
      ]);
      expect(checkEnv({ ...demo, VERCEL_ENV: "production", DEMO_PASSCODE: "open-sesame-42" })).toEqual({ ok: true });
    });

    it("needs no passcode locally or with demo mode off", () => {
      expect(checkEnv(demo)).toEqual({ ok: true });
      expect(checkEnv({ ...base, DEMO_MODE: "false", VERCEL_ENV: "production" })).toEqual({ ok: true });
      expect(demoPasscodeRequired({ ...base, VERCEL_ENV: "production" })).toBe(false);
    });

    it("needs no passcode in production when the demo is opened on purpose", () => {
      expect(demoPasscodeRequired({ ...demo, VERCEL_ENV: "production", DEMO_PUBLIC: "true" })).toBe(false);
      expect(checkEnv({ ...demo, VERCEL_ENV: "production", DEMO_PUBLIC: "true" })).toEqual({ ok: true });
      expect(demoPasscodeRequired({ ...demo, VERCEL_ENV: "production", DEMO_PUBLIC: "false" })).toBe(true);
      expect(problems({ ...demo, DEMO_PUBLIC: "yes" })[0]).toMatch(/^DEMO_PUBLIC must be "true" or "false"/);
    });

    it("wants the demo password, and a passcode long enough to resist guessing", () => {
      expect(problems({ ...base, DEMO_MODE: "true" })).toEqual(["DEMO_ACCOUNT_PASSWORD is missing (needed while DEMO_MODE=true)"]);
      expect(problems({ ...demo, DEMO_PASSCODE: "1234" })[0]).toMatch(/^DEMO_PASSCODE must be at least 8 characters/);
    });
  });
});
