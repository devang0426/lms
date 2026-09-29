import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "@/lib/markdown";
import { documentNotesSections, documentsSource } from "./document";

describe("document mode", () => {
  it("joins the documents under their titles, skipping empty ones", () => {
    expect(
      documentsSource([
        { title: "Slides", text: " Page one. " },
        { title: "Empty", text: "  " },
        { title: "Reading", text: "More." },
      ]),
    ).toBe("# Slides\n\nPage one.\n\n# Reading\n\nMore.");
  });

  it("numbers the notes' ## sections as chapters for the card and quiz prompts", () => {
    const blocks = markdownToBlocks("An overview.\n\n## Span\n\nAll combinations.\n\n### Detail\n\nMore.\n\n## **Basis**\n\nIndependent spanning set.");
    const { text, chapters } = documentNotesSections(blocks, "Week 2");
    expect(chapters.map((c) => c.title)).toEqual(["Week 2", "Span", "Basis"]);
    expect(text).toContain("Chapter 2: Span\n");
    expect(text).toContain("Chapter 3: Basis\nIndependent spanning set.");
  });

  it("uses # headings when the notes have no ## sections", () => {
    const blocks = markdownToBlocks("# Vectors\n\nArrows.\n\n# Matrices\n\nGrids.");
    expect(documentNotesSections(blocks, "x").chapters.map((c) => c.title)).toEqual(["Vectors", "Matrices"]);
  });
});
