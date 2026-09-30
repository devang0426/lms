import { describe, expect, it } from "vitest";
import { isPageNavigation, type ClickKeys } from "./page-navigation";

const here = { href: "https://app.test/courses/1?tab=a", origin: "https://app.test", pathname: "/courses/1", search: "?tab=a" };
const plain: ClickKeys = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...extra });

describe("isPageNavigation (the pending bar)", () => {
  it("starts for a plain click on another page of the app", () => {
    expect(isPageNavigation(plain, link("/study"), here)).toBe(true);
    expect(isPageNavigation(plain, link("https://app.test/courses/2"), here)).toBe(true);
  });

  it("starts when only the query changes", () => {
    expect(isPageNavigation(plain, link("/courses/1?tab=b"), here)).toBe(true);
  });

  it("stays off for the same page or a #hash on it", () => {
    expect(isPageNavigation(plain, link("/courses/1?tab=a"), here)).toBe(false);
    expect(isPageNavigation(plain, link("/courses/1?tab=a#notes"), here)).toBe(false);
  });

  it("stays off for new tabs, downloads and other sites", () => {
    expect(isPageNavigation({ ...plain, metaKey: true }, link("/study"), here)).toBe(false);
    expect(isPageNavigation({ ...plain, ctrlKey: true }, link("/study"), here)).toBe(false);
    expect(isPageNavigation({ ...plain, button: 1 }, link("/study"), here)).toBe(false);
    expect(isPageNavigation(plain, link("/study", { target: "_blank" }), here)).toBe(false);
    expect(isPageNavigation(plain, link("/documents/9", { download: true }), here)).toBe(false);
    expect(isPageNavigation(plain, link("https://example.com/"), here)).toBe(false);
    expect(isPageNavigation(plain, link("mailto:someone@example.com"), here)).toBe(false);
  });

  it("allows an explicit _self target", () => {
    expect(isPageNavigation(plain, link("/study", { target: "_self" }), here)).toBe(true);
  });
});
