import { describe, expect, it } from "vitest";
import { renderPostMarkdown } from "./markdown";

/* Posts people write for each other (feature 21) render Markdown and
   maths, never raw HTML. */
describe("renderPostMarkdown", () => {
  it("renders Markdown and maths", () => {
    const html = renderPostMarkdown("**Span** of $(1, 2)$:\n\n- one\n- two");
    expect(html).toContain("<strong>Span</strong>");
    expect(html).toContain("katex");
    expect(html).toContain("<li>one</li>");
  });

  it("shows raw HTML as text instead of parsing it", () => {
    const html = renderPostMarkdown('<div style="position:fixed;inset:0">gotcha</div>\n\nand <b onclick="x()">inline</b>');
    expect(html).not.toMatch(/<div style/);
    expect(html).not.toMatch(/<b onclick/);
    expect(html).toContain("&lt;div");
    expect(html).toContain("&lt;b onclick");
  });

  it("gives screen readers MathML, with the TeX kept in its annotation (not loose text)", () => {
    const html = renderPostMarkdown("If $c < 0$ the vector reverses.");
    expect(html).toContain("<math");
    expect(html).toMatch(/<annotation[^>]*>c &lt; 0<\/annotation>/);
    expect(html).toContain('aria-hidden="true"'); // the visual HTML
  });

  it("turns images into links and drops script links", () => {
    const html = renderPostMarkdown("![pixel](https://tracker.example/p.png) [x](javascript:alert(1))");
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://tracker.example/p.png"');
    expect(html).not.toContain("javascript:");
  });
});
