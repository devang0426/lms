import { describe, expect, it } from "vitest";
import { renderAnswerMarkdown } from "@/lib/markdown";
import {
  bestMoment,
  citationChipsHtml,
  checkAnswer,
  citationLabel,
  claimsFor,
  normalizeMarkers,
  NOT_IN_SYLLABUS,
  releasable,
  stripMarkers,
} from "./citations";

describe("checkAnswer", () => {
  it("keeps valid citations and renumbers them by first use", () => {
    const r = checkAnswer("Span is all combinations [S3]. A vector has length [S1]. Again [S3].", 4);
    expect(r).toEqual({
      refused: false,
      content: "Span is all combinations [S1]. A vector has length [S2]. Again [S1].",
      cited: [2, 0],
    });
  });

  it("drops a made-up citation", () => {
    const r = checkAnswer("Span is all combinations [S2]. Also this [S9].", 3);
    expect(r).toEqual({ refused: false, content: "Span is all combinations [S1]. Also this.", cited: [1] });
  });

  it("refuses when no valid citation is left", () => {
    expect(checkAnswer("A confident answer with no sources.", 3)).toEqual({ refused: true });
    expect(checkAnswer("Only a fake one [S9] and [S0].", 3)).toEqual({ refused: true });
  });

  it("refuses on the refusal token, alone or with chatter", () => {
    expect(checkAnswer(NOT_IN_SYLLABUS, 3)).toEqual({ refused: true });
    expect(checkAnswer(`Sorry. ${NOT_IN_SYLLABUS} [S1]`, 3)).toEqual({ refused: true });
    expect(checkAnswer("   ", 3)).toEqual({ refused: true });
  });

  it("keeps the first two of a stacked run of markers", () => {
    const r = checkAnswer("Span is every combination. [S1] [S2] [S3] [S4] [S5]", 5);
    expect(r).toEqual({ refused: false, content: "Span is every combination. [S1][S2]", cited: [0, 1] });
    expect(checkAnswer("x [S2, S3, S4].", 4)).toEqual({ refused: false, content: "x [S1][S2].", cited: [1, 2] });
  });

  it("splits grouped markers", () => {
    expect(normalizeMarkers("x [S1, S2] y [S3,4] z [S2; S5]")).toBe("x [S1][S2] y [S3][S4] z [S2][S5]");
    const r = checkAnswer("Both say so [S2, S1].", 2);
    expect(r).toEqual({ refused: false, content: "Both say so [S1][S2].", cited: [1, 0] });
  });
});

describe("streaming", () => {
  it("holds back anything that could still become the refusal token", () => {
    expect(releasable("")).toBe(0);
    expect(releasable("<<NOT_IN")).toBe(0);
    expect(releasable(`  ${NOT_IN_SYLLABUS}`)).toBe(0);
    expect(releasable("<<NOT_IN_SYLLABUS>> extra")).toBe(0);
    expect(releasable("<<NO")).toBe(0);
    expect(releasable("A vector")).toBe(8);
    expect(releasable("<<A")).toBe(3);
  });

  it("strips markers, including a half-written one at the end", () => {
    expect(stripMarkers("Span [S1]. Vectors [S2, S3]. Next [S")).toBe("Span. Vectors. Next ");
    expect(stripMarkers("Ends with [S1")).toBe("Ends with ");
  });
});

describe("claims and labels", () => {
  it("finds the sentences that cite a source", () => {
    const text = "A vector is an arrow [S1]. Span is every combination [S2]. It fills the plane [S2].";
    expect(claimsFor(text, 2)).toBe("Span is every combination [S2]. It fills the plane [S2].");
  });

  it("labels a moment, a page, or neither", () => {
    expect(citationLabel(3, 768, null)).toBe("Lecture 3 · 12:48");
    expect(citationLabel(2, null, 4)).toBe("Lecture 2 · p. 4");
    expect(citationLabel(null, null, null)).toBe("Course material");
  });
});

describe("bestMoment", () => {
  const segments = [
    { startSec: 10, text: "Welcome back to linear algebra." },
    { startSec: 20, text: "A linear combination mixes both ideas, we scale some vectors and add them." },
    { startSec: 30, text: "The set of all linear combinations of a group of vectors is called their span." },
    { startSec: 40, text: "If they point along the same line, their span is only that line." },
  ];

  it("picks the segment that says what the claim says", () => {
    expect(bestMoment(segments, "The span is the set of all combinations of the vectors.")?.startSec).toBe(30);
    expect(bestMoment(segments, "Two vectors on the same line span only that line.")?.startSec).toBe(40);
  });

  it("returns null when nothing overlaps enough", () => {
    expect(bestMoment(segments, "Photosynthesis happens in leaves.")).toBeNull();
    expect(bestMoment([], "span of vectors")).toBeNull();
  });
});

describe("rendering citations", () => {
  const cite = (label: string, startSec: number | null) => ({ chunkId: label, lessonId: "l1", startSec, page: null, label });

  const render = (content: string, citations: ReturnType<typeof cite>[]) =>
    renderAnswerMarkdown(content, (src, keep) => citationChipsHtml(src, citations, keep));

  it("turns markers into sanitized chips and a made-up [S9] into nothing", () => {
    const html = render("Span is every combination [S1]. Made up [S9].", [cite("Lecture 2 · 08:17", 497)]);
    expect(html).toContain('<button type="button" class="cite-chip" data-cite="0" aria-label="Lecture 2 · 08:17">08:17</button>');
    expect(html).not.toContain("S9");
    expect(html.match(/data-cite/g)).toHaveLength(1);
  });

  // Feature 24 (S7): a poisoned source can't make the answer draw over the page.
  it("shows the model's raw HTML as text, while chips and maths still render", () => {
    const html = render(
      'Span is every combination [S1] of $\\vec v$. <a style="position:fixed;inset:0" href="https://evil.example/login">Sign in again</a>',
      [cite("Lecture 2 · 08:17", 497)],
    );
    expect(html).not.toMatch(/<a[^>]*style/);
    expect(html).not.toContain('<a style="position:fixed');
    expect(html).toContain("&lt;a style=");
    expect(html).toContain('class="cite-chip"');
    expect(html).toContain('class="katex"');
    // Only KaTeX keeps inline styles.
    const outsideMath = html.replace(/<span class="katex">[\s\S]*<\/span>/, "");
    expect(outsideMath).not.toMatch(/<[a-z][^>]*\sstyle=/);
  });

  it("escapes labels, so a lesson title can't inject markup", () => {
    const html = render("x [S1]", [cite('Lecture 1 "><img src=x onerror=alert(1)>', null)]);
    // The whole label stays inside the quoted aria-label value.
    const outsideAttributes = html.replace(/"[^"]*"/g, '""');
    expect(outsideAttributes).not.toContain("<img");
    expect(outsideAttributes).not.toContain("onerror");
    expect(html).toContain('aria-label="Lecture 1 &quot;');
  });
});
