import { describe, expect, it } from "vitest";
import { vttToCues, vttToText } from "./ytdlp.mjs";

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
