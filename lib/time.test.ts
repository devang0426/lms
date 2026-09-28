import { describe, expect, it } from "vitest";
import { formatTime, parseT } from "./time";

describe("formatTime", () => {
  it("formats mm:ss with a padded minute", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(252)).toBe("04:12");
    expect(formatTime(768)).toBe("12:48");
    expect(formatTime(59.9)).toBe("00:59");
  });

  it("switches to h:mm:ss from an hour", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3723)).toBe("1:02:03");
  });

  it("treats junk as zero", () => {
    expect(formatTime(-5)).toBe("00:00");
    expect(formatTime(Number.NaN)).toBe("00:00");
  });
});

describe("parseT", () => {
  it("reads plain seconds", () => {
    expect(parseT("768")).toBe(768);
    expect(parseT("12.5")).toBe(12.5);
    expect(parseT("0")).toBe(0);
  });

  it("reads unit form", () => {
    expect(parseT("12m48s")).toBe(768);
    expect(parseT("1h2m3s")).toBe(3723);
    expect(parseT("48s")).toBe(48);
    expect(parseT("12m")).toBe(720);
    expect(parseT("1H")).toBe(3600);
  });

  it("reads clock form", () => {
    expect(parseT("12:48")).toBe(768);
    expect(parseT("1:02:03")).toBe(3723);
  });

  it("rejects everything else", () => {
    for (const v of [null, undefined, "", " ", "-5", "abc", "12m48", "m", "1:75", "1:60:00", "12:48:99", "1e3"]) {
      expect(parseT(v)).toBeNull();
    }
  });
});
