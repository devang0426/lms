import { parseHTML } from "linkedom";
import type { DocPart } from "@/lib/ai/types";

/* HTML → citable sections (feature 18). A web page's readable article and a
   DOCX (through mammoth) both arrive as HTML; each h1–h3 heading starts a
   new section named after it, so answers can cite "Eigenvalues" rather
   than a whole document. Text before the first heading is its own section
   with no name. Pure apart from the DOM parser. */

const BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td, th, figcaption, dt, dd";
const HEADING = /^H[1-3]$/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function htmlToSections(html: string): DocPart[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = [...document.querySelectorAll(BLOCKS)] as Element[];
  const parts: DocPart[] = [];
  let current: { section?: string; lines: string[] } = { lines: [] };
  const flush = () => {
    const text = current.lines.join("\n").trim();
    if (text) parts.push(current.section ? { section: current.section, text } : { text });
  };

  for (const el of blocks) {
    // A <p> inside an <li> or <blockquote> is read with its parent.
    if (el.parentElement?.closest(BLOCKS)) continue;
    const text = clean(el.textContent ?? "");
    if (!text) continue;
    if (HEADING.test(el.tagName)) {
      flush();
      current = { section: text.slice(0, 120), lines: [] };
    } else {
      current.lines.push(el.tagName === "LI" ? `- ${text}` : text);
    }
  }
  flush();

  // No block elements at all (plain text in a <div>): one section.
  if (parts.length === 0) {
    const text = clean(document.body?.textContent ?? "");
    if (text) parts.push({ text });
  }
  return parts;
}

/* The document's full text, section headings included. */
export function partsText(parts: readonly DocPart[]): string {
  return parts
    .map((p) => (p.section ? `## ${p.section}\n\n${p.text}` : p.text))
    .join("\n\n")
    .trim();
}
