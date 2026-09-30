import { describe, expect, it } from "vitest";
import { looksLikeMp4, titleFromVideoName, videoFileProblem } from "./upload-check";

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 50 * MB) => ({ name, type, size });

describe("videoFileProblem", () => {
  it("accepts an MP4 the browser labels video/mp4", () => {
    expect(videoFileProblem(file("lecture.mp4", "video/mp4"))).toBeNull();
    expect(videoFileProblem(file("lecture", "video/mp4"))).toBeNull();
  });

  it("accepts a .mp4 whatever type the browser reports (V6)", () => {
    for (const type of ["", "application/octet-stream", "video/x-m4v", "video/mpeg4"]) {
      expect(videoFileProblem(file("Lecture 3.MP4", type)), type || "(empty)").toBeNull();
      expect(looksLikeMp4({ name: "lecture.mp4 ", type })).toBe(true);
    }
  });

  it("refuses QuickTime with the export hint", () => {
    expect(videoFileProblem(file("clip.mov", "video/quicktime"))).toMatch(/QuickTime .*export as MP4/);
    expect(videoFileProblem(file("clip.mov", ""))).toMatch(/QuickTime/);
    expect(videoFileProblem(file("clip.mp4", "video/quicktime"))).toMatch(/QuickTime/);
  });

  it("refuses other files", () => {
    expect(videoFileProblem(file("clip.webm", "video/webm"))).toMatch(/isn't an MP4/);
    expect(videoFileProblem(file("notes.pdf", ""))).toMatch(/isn't an MP4/);
    expect(looksLikeMp4({ name: "clip.mp4.zip", type: "application/zip" })).toBe(false);
  });

  it("refuses empty files and files over 2 GB", () => {
    expect(videoFileProblem(file("lecture.mp4", "video/mp4", 0))).toMatch(/empty/);
    expect(videoFileProblem(file("lecture.mp4", "video/mp4", 2048 * MB))).toBeNull();
    expect(videoFileProblem(file("lecture.mp4", "video/mp4", 2048 * MB + 1))).toMatch(/over 2 GB/);
  });
});

describe("titleFromVideoName", () => {
  it("drops the extension and underscores", () => {
    expect(titleFromVideoName("Week_3 - Eigenvalues.mp4")).toBe("Week 3 - Eigenvalues");
    expect(titleFromVideoName("lecture__01   final.MP4")).toBe("lecture 01 final");
    expect(titleFromVideoName("Gram-Schmidt.mp4")).toBe("Gram-Schmidt");
  });

  it("falls back when nothing is left", () => {
    expect(titleFromVideoName(".mp4")).toBe("Lecture");
    expect(titleFromVideoName("___.mp4")).toBe("Lecture");
  });

  it("keeps titles within the 200-character limit", () => {
    expect(titleFromVideoName(`${"a".repeat(300)}.mp4`)).toHaveLength(200);
  });
});
