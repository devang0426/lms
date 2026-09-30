import { afterEach, describe, expect, it, vi } from "vitest";
import { demoPasscode, passcodeMatches } from "./accounts";

/* Feature 24 (S1): the demo passcode. */
describe("demo passcode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches only the exact passcode (surrounding spaces from pasting are fine)", () => {
    expect(passcodeMatches("open-sesame-42", "open-sesame-42")).toBe(true);
    expect(passcodeMatches("  open-sesame-42 ", "open-sesame-42")).toBe(true);
    for (const wrong of ["", "open-sesame-4", "open-sesame-420", "OPEN-SESAME-42", "x".repeat(500)]) {
      expect(passcodeMatches(wrong, "open-sesame-42")).toBe(false);
    }
  });

  it("is off when DEMO_PASSCODE isn't set", () => {
    vi.stubEnv("DEMO_PASSCODE", "");
    expect(demoPasscode()).toBeNull();
    vi.stubEnv("DEMO_PASSCODE", "open-sesame-42");
    expect(demoPasscode()).toBe("open-sesame-42");
  });
});
