import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

const origin = "http://localhost:3100";

describe("safeReturnPath (feature 34)", () => {
  it("returns to a page on this site, with its query and hash", () => {
    expect(safeReturnPath("http://localhost:3100/courses/abc?tab=announcements#top", origin)).toBe("/courses/abc?tab=announcements#top");
    expect(safeReturnPath("/courses/abc/lessons/def?t=768", origin)).toBe("/courses/abc/lessons/def?t=768");
  });

  it("goes home when there's nowhere to return to", () => {
    expect(safeReturnPath(null, origin)).toBe("/");
    expect(safeReturnPath("", origin)).toBe("/");
    expect(safeReturnPath("http://[bad", origin)).toBe("/");
  });

  it("never leaves the site", () => {
    expect(safeReturnPath("https://evil.example/courses", origin)).toBe("/");
    expect(safeReturnPath("//evil.example/courses", origin)).toBe("/");
    expect(safeReturnPath("http://localhost:3000/courses", origin)).toBe("/"); // another port is another origin
    expect(safeReturnPath("javascript:alert(1)", origin)).toBe("/");
  });

  it("doesn't loop back to sign-in", () => {
    expect(safeReturnPath("/sign-in?redirect_url=%2F", origin)).toBe("/");
    expect(safeReturnPath("/sign-up/verify", origin)).toBe("/");
    expect(safeReturnPath("/sign-installer", origin)).toBe("/sign-installer");
  });
});
