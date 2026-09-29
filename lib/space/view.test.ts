import { describe, expect, it } from "vitest";
import { notePhase, noteSummary, noteTitleFromFileName } from "./view";

describe("notePhase", () => {
  it("follows the source while it's read", () => {
    expect(notePhase({ status: "uploading" }, null)).toBe("uploading");
    expect(notePhase({ status: "processing" }, "running")).toBe("processing");
    expect(notePhase({ status: "processing" }, null)).toBe("processing");
    expect(notePhase({ status: "failed" }, "failed")).toBe("failed");
  });

  it("stays in the making while the run drafts after the source is read", () => {
    expect(notePhase({ status: "ready" }, "running")).toBe("processing");
    expect(notePhase({ status: "ready" }, "queued")).toBe("processing");
  });

  it("is ready once the run finished, and failed when it stopped after reading", () => {
    expect(notePhase({ status: "ready" }, "completed")).toBe("ready");
    expect(notePhase({ status: "ready" }, null)).toBe("ready");
    expect(notePhase({ status: "ready" }, "failed")).toBe("failed");
    expect(notePhase({ status: "ready" }, "canceled")).toBe("failed");
  });

  it("treats a run that died before the source was read as failed", () => {
    expect(notePhase({ status: "processing" }, "failed")).toBe("failed");
  });

  it("fails a note that has lost its source", () => {
    expect(notePhase(null, null)).toBe("failed");
  });
});

describe("noteTitleFromFileName", () => {
  it("drops the extension and folders, and spaces out separators", () => {
    expect(noteTitleFromFileName("Week_2-Slides.pdf")).toBe("Week 2 Slides");
    expect(noteTitleFromFileName("C:\\notes\\Linear Algebra.docx")).toBe("Linear Algebra");
    expect(noteTitleFromFileName("lecture.recording.m4a")).toBe("lecture.recording");
  });

  it("never gives an empty title", () => {
    expect(noteTitleFromFileName(".pdf")).toBe("Untitled note");
    expect(noteTitleFromFileName("")).toBe("Untitled note");
  });
});

describe("noteSummary", () => {
  it("counts what's ready", () => {
    expect(noteSummary("ready", { cards: 27, questions: 24 })).toBe("27 cards · 24 questions");
    expect(noteSummary("ready", { cards: 1, questions: 0 })).toBe("1 card");
    expect(noteSummary("ready", { cards: 0, questions: 0 })).toBe("Notes ready");
  });

  it("says where a note that isn't ready stands", () => {
    expect(noteSummary("processing", { cards: 0, questions: 0 })).toMatch(/Being made/);
    expect(noteSummary("failed", { cards: 0, questions: 0 })).toBe("Something went wrong");
    expect(noteSummary("uploading", { cards: 0, questions: 0 })).toBe("The upload didn't finish");
  });
});
