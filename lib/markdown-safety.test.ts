import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { renderAnswerMarkdown, renderMarkdown, renderPostMarkdown, renderRichInline } from "./markdown";

/* Feature 24 (S7): `style` only on KaTeX output, raw HTML in answers as text. */

const styledElement = /<[a-z][^>]*\sstyle=/i;

/* Elements with a style attribute that aren't part of a KaTeX formula. */
function styledOutsideMath(html: string): string[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return [...document.querySelectorAll("[style]")].filter((el) => !el.closest(".katex")).map((el) => el.outerHTML);
}

describe("style only on maths", () => {
  const overlay = '<a style="position:fixed;inset:0" href="https://evil.example">Sign in</a> and <div style="position:fixed">x</div>';

  it("drops style attributes from raw HTML in notes and instructions", () => {
    const html = renderMarkdown(`Notes.\n\n${overlay}`);
    expect(html).toContain('href="https://evil.example"'); // raw HTML is allowed here, just not styled
    expect(html).not.toMatch(styledElement);
    expect(renderRichInline(overlay)).not.toMatch(styledElement);
  });

  it("drops <style> elements", () => {
    const html = renderMarkdown("<style>.study-notes a { position: fixed; inset: 0 }</style>\n\nText");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("position: fixed");
  });

  it("keeps KaTeX's own inline styles", () => {
    const html = renderMarkdown("A fraction: $\\frac{a}{b}$ and $$x^2$$");
    expect(html).toContain('class="katex"');
    expect(html).toMatch(/<span class="katex">[\s\S]*style="/);
    expect(html).toContain("<annotation");
    expect(styledOutsideMath(html)).toEqual([]);
  });

  it("puts maths back only as text, never inside an attribute", () => {
    for (const md of [
      '<a style="position:fixed;inset:0" href="https://evil.example" $x$>link</a>',
      '<a title="$x$" href="https://evil.example">link</a>',
      "[link]($x$)",
    ]) {
      const html = renderMarkdown(md);
      expect(styledOutsideMath(html)).toEqual([]);
      expect(html).not.toMatch(/%%NMKEEP/i);
      // No formula ended up inside a tag.
      expect(html).not.toMatch(/<a[^>]*katex/);
    }
  });

  it("caps sizes written in the TeX", () => {
    const html = renderMarkdown("$\\rule{500em}{500em}$");
    expect(html).not.toMatch(/style="[^"]*500em/);
    expect(html).toMatch(/style="[^"]*20em/);
  });
});

describe("renderAnswerMarkdown", () => {
  it("renders Markdown and maths, and shows raw HTML as text", () => {
    const html = renderAnswerMarkdown('**Eigenvalues** of $A$:\n\n- one\n\n<img src=x onerror="alert(1)"> <b>bold?</b>');
    expect(html).toContain("<strong>Eigenvalues</strong>");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<li>one</li>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;bold?&lt;/b&gt;");
  });

  it("inserts trusted HTML only where the caller asks", () => {
    const html = renderAnswerMarkdown("Before [X] after", (src, keep) => src.replace("[X]", keep('<button type="button" class="cite-chip">1:00</button>')));
    expect(html).toBe('<p>Before <button type="button" class="cite-chip">1:00</button> after</p>\n');
  });

  it("renders the same as a post when there is nothing to insert", () => {
    const md = "Hi <div>x</div> $y$ ![img](https://x.example/p.png)";
    expect(renderAnswerMarkdown(md)).toBe(renderPostMarkdown(md));
  });
});
