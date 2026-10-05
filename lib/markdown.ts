/* Markdown to sanitized HTML (DOMPurify, KaTeX). The block model and the
   plain text helpers live in lib/markdown-blocks.ts, re-exported here so
   UI code can import everything from one place. Server-side background
   tasks import lib/markdown-blocks directly: this module loads jsdom.
   jsdom stays at 26.1.0 (package.json overrides): later releases
   require() ES modules, which failed in Vercel's functions. */

import DOMPurify from "isomorphic-dompurify";
import { Marked, marked } from "marked";
import katex from "katex";
import { normalizeMath } from "./markdown-blocks";

export { blocksToMarkdown, markdownToBlocks, normalizeMath, plainText, stripFence } from "./markdown-blocks";

/* ---- sanitizing (feature 24, S7) -------------------------------------------
   Rendered HTML never keeps a `style` attribute or a <style> element: an
   injected `<a style="position:fixed;inset:0" href="…">` would cover the
   page with a fake link. Maths is the one thing that needs inline styles
   (KaTeX positions every glyph with them), so each formula is rendered and
   sanitized on its own, style allowed, and swapped in for a placeholder
   token only after the text around it has been sanitized. Citation chips
   are swapped in the same way.

   A token is swapped back only where it stands as text: DOMPurify drops
   any attribute that holds one (the hook below), since a formula's quotes
   inside `<a title="…">` would break out of the attribute. */

const KEEP_RE = /%%NMKEEP(\d+)%%/g;

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (/%%nmkeep/i.test(data.attrName) || /%%nmkeep/i.test(data.attrValue)) data.keepAttr = false;
});

const SANITIZE = { FORBID_ATTR: ["style"], FORBID_TAGS: ["style"] };

/* KaTeX output on its own. Its MathML wraps the formula in <semantics>
   with its TeX in <annotation>: DOMPurify drops both by default and would
   leave the TeX as loose text, read aloud twice. Both are plain MathML
   (annotation-xml, which can carry HTML, stays out). */
const MATH_FRAGMENT = { ADD_TAGS: ["semantics", "annotation"] };

/* Stashes trusted HTML (a citation chip) and returns the token to put in
   the Markdown where it goes. */
export type KeepHtml = (html: string) => string;

function renderSafely(
  md: string,
  parse: (src: string) => string,
  opts: { forbidTags?: string[]; inserts?: (src: string, keep: KeepHtml) => string } = {},
): string {
  const stash: string[] = [];
  const token = (html: string) => `%%NMKEEP${stash.push(html) - 1}%%`;
  const math = (latex: string, display: boolean) => token(DOMPurify.sanitize(renderMath(latex, display), MATH_FRAGMENT));
  let src = normalizeMath(md);
  src = src.replace(MATH_BLOCK_RE, (_m, x: string) => math(x.trim(), true));
  src = src.replace(MATH_INLINE_RENDER_RE, (_m, x: string) => math(x.trim(), false));
  if (opts.inserts) src = opts.inserts(src, (html) => token(DOMPurify.sanitize(html, SANITIZE)));
  const html = DOMPurify.sanitize(parse(src), { ...SANITIZE, FORBID_TAGS: [...SANITIZE.FORBID_TAGS, ...(opts.forbidTags ?? [])] });
  return html.replace(KEEP_RE, (_m, i: string) => stash[Number(i)] ?? "");
}

/* ---- inline / math rendering ---------------------------------------------- */

/** Inline markdown (bold/italic/code/links) -> sanitized HTML. Works on the
 *  server too (isomorphic-dompurify brings its own DOM). */
export function renderInline(text: string): string {
  const html = marked.parseInline(text, { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE);
}

/** KaTeX render of a LaTeX string to an HTML string. Pure string generation —
 *  safe to call in any environment (no DOM required by KaTeX itself).
 *  HTML for the eye plus MathML for screen readers (feature 23): the HTML is
 *  aria-hidden, the MathML visually hidden by KaTeX's CSS. Its inline styles
 *  are the only ones rendered anywhere (feature 24), so sizes written in the
 *  TeX (\rule, \kern, \raisebox) are capped: a formula can't be stretched
 *  over the rest of the page. `trust` stays off (no \href, no \htmlStyle). */
export function renderMath(latex: string, display = true): string {
  return katex.renderToString(latex, {
    throwOnError: false,
    displayMode: display,
    output: "htmlAndMathml",
    maxSize: 20,
    trust: false,
  });
}

const MATH_BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
const MATH_INLINE_RENDER_RE = /\$([^$\n]+?)\$/g;

/** Full block-level Markdown (headings, lists, tables, code, $-math) -> sanitized
 *  HTML, raw HTML allowed (then sanitized). Used for notes, assignment
 *  instructions and feedback. Math is stashed before Markdown parsing so KaTeX
 *  markup survives, and put back after sanitizing (see renderSafely). */
export function renderMarkdown(md: string): string {
  return renderSafely(md, (src) => marked.parse(src, { async: false }) as string);
}

/** Inline markdown + inline math ($…$ and \(…\)) -> sanitized HTML. Used by the
 *  editor read-view so bold terms, code, and equations all render in place. */
export function renderRichInline(text: string): string {
  return renderSafely(text, (src) => marked.parseInline(src, { async: false }) as string);
}

/* Text no one here wrote for the page: raw HTML is shown as text, never
   parsed, so no one can style or overlay the page for other readers, and
   images become links (nothing loads from another site). */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textOnlyMarked = new Marked({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ href, text }) => `<a href="${escapeHtml(href)}">${escapeHtml(text || href)}</a>`,
  },
});

const TEXT_ONLY_FORBID = ["img", "form", "input", "button"];

/* Posts people write for each other (feature 21: announcements, discussion
   threads and replies). Markdown and $-math only. */
export function renderPostMarkdown(md: string): string {
  return renderSafely(md, (src) => textOnlyMarked.parse(src, { async: false }) as string, { forbidTags: TEXT_ONLY_FORBID });
}

/* Assistant and space-chat answers (feature 24, S7). The model's text can
   repeat whatever a retrieved source said, including a poisoned web page
   added as course material, so it renders like a post: Markdown and
   $-math, raw HTML as text. `inserts` puts trusted HTML (the citation
   chips, lib/chat/citations.ts) in place of the markers, after the
   escaping: it returns the source with each marker replaced by keep(html). */
export function renderAnswerMarkdown(md: string, inserts?: (src: string, keep: KeepHtml) => string): string {
  return renderSafely(md, (src) => textOnlyMarked.parse(src, { async: false }) as string, { forbidTags: TEXT_ONLY_FORBID, inserts });
}
