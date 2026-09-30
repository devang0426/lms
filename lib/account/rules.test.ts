import { describe, expect, it } from "vitest";
import {
  confirmsDeletion,
  deleteRefusal,
  EXPORT_FAILED_MESSAGE,
  exportExpiresAt,
  exportPhase,
  fileSizeLabel,
} from "./rules";

const now = new Date("2026-09-30T12:00:00Z");
const later = new Date("2026-10-07T12:00:00Z");

describe("exportExpiresAt", () => {
  it("is 7 days after the request", () => {
    expect(exportExpiresAt(now).toISOString()).toBe(later.toISOString());
  });
});

describe("confirmsDeletion", () => {
  it("takes the email, ignoring case and spaces", () => {
    expect(confirmsDeletion("  Aanya@Example.edu ", "aanya@example.edu")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(confirmsDeletion("aanya", "aanya@example.edu")).toBe(false);
    expect(confirmsDeletion("", "aanya@example.edu")).toBe(false);
  });

  it("can't confirm an account with no email", () => {
    expect(confirmsDeletion("", "")).toBe(false);
  });
});

describe("deleteRefusal", () => {
  const admin = { id: "a1" };
  const demoOff = { on: false, emails: ["demo.student+clerk_test@example.com"] };
  const demoOn = { ...demoOff, on: true };

  it("refuses the admin's own account", () => {
    expect(deleteRefusal({ id: "a1", email: "me@example.edu" }, admin, demoOff)).toMatch(/your own account/);
  });

  it("refuses a demo account only in demo mode", () => {
    const demoStudent = { id: "s1", email: "Demo.Student+clerk_test@example.com" };
    expect(deleteRefusal(demoStudent, admin, demoOn)).toMatch(/demo accounts/);
    expect(deleteRefusal(demoStudent, admin, demoOff)).toBeNull();
  });

  it("lets anyone else be deleted, in demo mode too", () => {
    expect(deleteRefusal({ id: "s2", email: "real@example.edu" }, admin, demoOn)).toBeNull();
  });
});

describe("exportPhase", () => {
  const row = (status: "building" | "ready" | "failed", extra: Partial<{ error: string; expiresAt: Date }> = {}) => ({
    status,
    expiresAt: later,
    sizeBytes: status === "ready" ? 2048 : null,
    error: extra.error ?? null,
    ...extra,
  });

  it("is none with no export, or once the latest has expired", () => {
    expect(exportPhase(null, null, now)).toEqual({ phase: "none" });
    expect(exportPhase(row("ready", { expiresAt: now }), null, now)).toEqual({ phase: "none" });
  });

  it("offers the file while it's ready", () => {
    expect(exportPhase(row("ready"), { status: "completed" }, now)).toEqual({ phase: "ready", expiresAt: later, sizeBytes: 2048 });
  });

  it("is building while its run is queued or running", () => {
    expect(exportPhase(row("building"), { status: "queued" }, now)).toEqual({ phase: "building" });
    expect(exportPhase(row("building"), { status: "running" }, now)).toEqual({ phase: "building" });
    expect(exportPhase(row("building"), null, now)).toEqual({ phase: "building" });
  });

  it("counts a row stuck building behind an ended run as failed, so the button comes back", () => {
    expect(exportPhase(row("building"), { status: "failed" }, now)).toEqual({ phase: "failed", message: EXPORT_FAILED_MESSAGE });
    expect(exportPhase(row("building"), { status: "canceled" }, now)).toEqual({ phase: "failed", message: EXPORT_FAILED_MESSAGE });
  });

  it("shows a failed row's own message", () => {
    expect(exportPhase(row("failed", { error: "Try again in a minute." }), null, now)).toEqual({ phase: "failed", message: "Try again in a minute." });
  });
});

describe("fileSizeLabel", () => {
  it("rounds to a readable size", () => {
    expect(fileSizeLabel(512)).toBe("512 B");
    expect(fileSizeLabel(84 * 1024)).toBe("84 KB");
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});
