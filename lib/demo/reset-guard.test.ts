import { describe, expect, it } from "vitest";
import { checkResetTarget } from "./reset-guard";

/* Feature 24 (R10): demo:reset only touches a database listed as a demo one. */
const direct = "postgresql://u:p@ep-demo-123.us-east-2.aws.neon.tech/db?sslmode=require";
const pooled = "postgresql://u:p@ep-demo-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require";
const other = "postgresql://u:p@ep-prod-999-pooler.us-east-2.aws.neon.tech/db?sslmode=require";

describe("checkResetTarget", () => {
  it("allows a listed host, and its -pooler twin", () => {
    expect(checkResetTarget({ DEMO_DB_HOSTS: "ep-demo-123.us-east-2.aws.neon.tech", DATABASE_URL: direct, DATABASE_URL_POOLED: pooled })).toEqual({
      ok: true,
      hosts: ["ep-demo-123-pooler.us-east-2.aws.neon.tech", "ep-demo-123.us-east-2.aws.neon.tech"],
    });
    // Several hosts, spaces and case don't matter.
    expect(checkResetTarget({ DEMO_DB_HOSTS: " other.example , EP-DEMO-123.us-east-2.aws.neon.tech", DATABASE_URL: direct })).toMatchObject({ ok: true });
  });

  it("refuses a host that isn't listed, even if only one of the URLs points there", () => {
    const r = checkResetTarget({ DEMO_DB_HOSTS: "ep-demo-123.us-east-2.aws.neon.tech", DATABASE_URL: direct, DATABASE_URL_POOLED: other });
    expect(r).toEqual({ ok: false, reason: "ep-prod-999-pooler.us-east-2.aws.neon.tech isn't in DEMO_DB_HOSTS, so it isn't a demo database." });
  });

  it("refuses when nothing is listed, or there's no usable URL", () => {
    expect(checkResetTarget({ DATABASE_URL: direct })).toMatchObject({ ok: false, reason: expect.stringContaining("DEMO_DB_HOSTS is empty") });
    expect(checkResetTarget({ DEMO_DB_HOSTS: " , ", DATABASE_URL: direct })).toMatchObject({ ok: false });
    expect(checkResetTarget({ DEMO_DB_HOSTS: "x.example" })).toEqual({ ok: false, reason: "No DATABASE_URL is set." });
    expect(checkResetTarget({ DEMO_DB_HOSTS: "x.example", DATABASE_URL: "not a url" })).toMatchObject({ ok: false });
  });

  it("doesn't let a look-alike host through", () => {
    for (const host of ["evil-ep-demo-123.us-east-2.aws.neon.tech", "ep-demo-123.us-east-2.aws.neon.tech.evil.example"]) {
      expect(checkResetTarget({ DEMO_DB_HOSTS: "ep-demo-123.us-east-2.aws.neon.tech", DATABASE_URL: `postgresql://u:p@${host}/db` })).toMatchObject({ ok: false });
    }
  });
});
