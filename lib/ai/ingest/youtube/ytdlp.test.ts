import { describe, expect, it } from "vitest";
import { parseInfo, vttToCues, vttToText } from "./ytdlp.mjs";

describe("parseInfo (feature 25)", () => {
  it("reads the title and the length in seconds", () => {
    expect(parseInfo("Lecture 3: Eigenvalues\n4212\n")).toEqual({ title: "Lecture 3: Eigenvalues", durationSec: 4212 });
    expect(parseInfo("Windows line ends\r\n95.5\r\n")).toEqual({ title: "Windows line ends", durationSec: 95.5 });
  });

  it("has no length for a live stream or a missing line", () => {
    expect(parseInfo("Live now\nNA\n")).toEqual({ title: "Live now", durationSec: null });
    expect(parseInfo("Only a title")).toEqual({ title: "Only a title", durationSec: null });
    expect(parseInfo("")).toEqual({ title: null, durationSec: null });
  });
});

const VTT = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:04.500
Welcome to <c>linear algebra</c>.

00:00:04.500 --> 00:00:06.000
Welcome to linear algebra.

00:12:48.200 --> 00:12:52.000 align:start position:0%
An eigenvector keeps its direction.
`;

describe("vttToCues", () => {
  it("keeps timestamps in seconds, strips markup, merges rolling repeats", () => {
    expect(vttToCues(VTT)).toEqual([
      { start: 1, end: 6, text: "Welcome to linear algebra." },
      { start: 768.2, end: 772, text: "An eigenvector keeps its direction." },
    ]);
  });

  it("vttToText still returns the flattened transcript", () => {
    expect(vttToText(VTT)).toBe("Welcome to linear algebra. An eigenvector keeps its direction.");
  });
});
