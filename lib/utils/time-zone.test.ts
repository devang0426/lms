import { describe, expect, it } from "vitest";
import { validTimeZone } from "./time-zone";

/* Feature 25: the tz cookie the server trusts for "It resets at 15:07". */
describe("validTimeZone", () => {
  it("accepts IANA zones Intl knows", () => {
    expect(validTimeZone("Asia/Kolkata")).toBe(true);
    expect(validTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(validTimeZone("UTC")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(validTimeZone("Mars/Olympus")).toBe(false);
    expect(validTimeZone("Asia/Kolkata; path=/")).toBe(false);
    expect(validTimeZone("")).toBe(false);
    expect(validTimeZone("x".repeat(80))).toBe(false);
  });
});
