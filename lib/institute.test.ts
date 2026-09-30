import { describe, expect, it } from "vitest";
import { institute, PUBLIC_PAGES, siteUrl, telHref } from "./institute";

describe("institute (feature 34)", () => {
  it("reads every detail from the environment, trimmed, with empty ones left out", () => {
    expect(
      institute({
        INSTITUTE_NAME: "  Northfield University ",
        INSTITUTE_TAGLINE: "Learning that stays.",
        INSTITUTE_EMAIL: "office@northfield.example.edu",
        INSTITUTE_PHONE: " ",
      }),
    ).toEqual({
      name: "Northfield University",
      tagline: "Learning that stays.",
      email: "office@northfield.example.edu",
      phone: null,
      address: null,
    });
  });

  it("stops the build without a name, rather than baking a nameless page", () => {
    expect(() => institute({})).toThrow(/INSTITUTE_NAME is not set/);
    expect(() => institute({ INSTITUTE_NAME: "  " })).toThrow(/INSTITUTE_NAME/);
  });
});

describe("siteUrl", () => {
  it("builds absolute URLs from NEXT_PUBLIC_APP_URL only", () => {
    const env = { NEXT_PUBLIC_APP_URL: "https://studyhall.example.edu" };
    expect(siteUrl("/welcome", env)).toBe("https://studyhall.example.edu/welcome");
    expect(siteUrl("/sitemap.xml", { NEXT_PUBLIC_APP_URL: "http://localhost:3000/" })).toBe("http://localhost:3000/sitemap.xml");
    expect(() => siteUrl("/", {})).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});

describe("telHref", () => {
  it("keeps only digits and a leading plus", () => {
    expect(telHref("+91 22 (1234) 5678")).toBe("tel:+912212345678");
  });
});

describe("PUBLIC_PAGES", () => {
  it("lists only the public pages, none of the app", () => {
    expect([...PUBLIC_PAGES]).toEqual(["/welcome", "/privacy", "/terms"]);
  });
});
