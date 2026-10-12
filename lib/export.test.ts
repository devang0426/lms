import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/ai/types";
import { combinedFileName, exportCombinedHtml, exportCombinedMarkdown, exportDocxHtml, type CombinedNotes } from "./export";

const block = (type: Block["type"], text: string): Block => ({ id: `${type}-${text}`, type, text });

const NOTES: CombinedNotes = {
  courseTitle: "Linear Algebra",
  courseCode: "MA 201",
  lessons: [
    { number: 1, title: "Vectors", moduleTitle: "Week 1", blocks: [block("heading2", "Span"), block("paragraph", "A **vector** has length.")] },
    { number: 3, title: "Eigen <values>", moduleTitle: "Week 2", blocks: [block("heading1", "Top"), block("bullet", "Av = λv")] },
  ],
};

describe("exportCombinedMarkdown (feature 36)", () => {
  const md = exportCombinedMarkdown(NOTES);

  it("opens with the course, its code, the lesson count and a contents list", () => {
    expect(md.startsWith("# Linear Algebra: notes\n\nMA 201 · 2 lessons\n\n- Lesson 1 · Vectors\n- Lesson 3 · Eigen <values>")).toBe(true);
  });

  it("puts each lesson under its own heading, in the given order, with its module", () => {
    expect(md.indexOf("# Lesson 1 · Vectors\n\n*Week 1*")).toBeLessThan(md.indexOf("# Lesson 3 · Eigen <values>\n\n*Week 2*"));
    expect(md).toContain("## Span\n\nA **vector** has length.");
    expect(md.split("\n---\n")).toHaveLength(3);
  });

  it("moves a lesson's own top-level headings under the lesson's title", () => {
    expect(md).toContain("## Top");
    expect(md).not.toMatch(/^# Top$/m);
  });
});

describe("exportCombinedHtml (feature 36)", () => {
  it("escapes titles, starts each lesson on a new page and keeps lesson order", () => {
    const html = exportCombinedHtml(NOTES, "word");
    expect(html).toContain("<title>Linear Algebra: notes</title>");
    expect(html).toContain(`<h1 class="lesson">Lesson 3 · Eigen &lt;values&gt;</h1>`);
    expect(html).not.toContain("<values>");
    expect(html.match(/<h1 class="lesson">/g)).toHaveLength(2);
    expect(html.indexOf(`<h1 class="lesson">Lesson 1`)).toBeLessThan(html.indexOf(`<h1 class="lesson">Lesson 3`));
    expect(html).toContain("<h2>Top</h2>");
    expect(html).toContain("<w:WordDocument>");
    expect(html).not.toContain("<script>");
  });

  it("opens the print dialog only in print mode", () => {
    const html = exportCombinedHtml(NOTES, "print");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`<script>addEventListener("load", () => print());</script>`);
    expect(html).not.toContain("<w:WordDocument>");
  });

  it("keeps the single-note Word export free of the print script", () => {
    const html = exportDocxHtml({ title: "Mine", blocks: [block("paragraph", "hi")] });
    expect(html).toContain("<h1>Mine</h1>");
    expect(html).not.toContain("<script>");
  });
});

describe("combinedFileName", () => {
  it("names the file after the course code, else the title", () => {
    expect(combinedFileName(NOTES, "md")).toBe("ma-201-notes.md");
    expect(combinedFileName({ courseCode: "", courseTitle: "Data Science!" }, "doc")).toBe("data-science-notes.doc");
    expect(combinedFileName({ courseCode: "", courseTitle: "" }, "md")).toBe("file-notes.md");
  });
});
