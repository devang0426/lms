import { describe, expect, it } from "vitest";
import { documentMaxSec, tooLongMessage } from "./length";

/* Feature 25 (S2): recordings and YouTube videos have a length cap. */
describe("documentMaxSec", () => {
  it("is 90 minutes unless DOCUMENT_MAX_MINUTES says otherwise", () => {
    expect(documentMaxSec({})).toBe(90 * 60);
    expect(documentMaxSec({ DOCUMENT_MAX_MINUTES: "45" })).toBe(45 * 60);
    expect(documentMaxSec({ DOCUMENT_MAX_MINUTES: "zero" })).toBe(90 * 60);
    expect(documentMaxSec({ DOCUMENT_MAX_MINUTES: "0" })).toBe(90 * 60);
  });
});

describe("tooLongMessage", () => {
  const max = 90 * 60;

  it("passes anything up to the cap, and an unknown length", () => {
    expect(tooLongMessage("audio", 90 * 60, max)).toBeNull();
    expect(tooLongMessage("audio", 20 * 60, max)).toBeNull();
    expect(tooLongMessage("youtube", 0, max)).toBeNull();
  });

  it("refuses a 3-hour recording with a message a person can act on", () => {
    expect(tooLongMessage("audio", 3 * 3600, max)).toBe(
      "This recording is 3 hours long. The longest we can take is 90 minutes: trim it, or split it into parts and add each one.",
    );
  });

  it("refuses a long YouTube video", () => {
    expect(tooLongMessage("youtube", 95 * 60, max)).toBe(
      "This video is 95 minutes long. The longest we can take is 90 minutes: pick a shorter video, or upload part of it as a recording.",
    );
    expect(tooLongMessage("youtube", 125 * 60, max)).toMatch(/^This video is 2 h 5 min long\./);
  });
});
