/* Note export: markdown file, .doc (Word-compatible HTML), and one-click print-to-PDF.
   Used by the private space's note page (feature 19); only a note's title
   and blocks are needed. A course's notes combine into one file the same
   ways (feature 36). */

import type { Block, Note } from "@/lib/ai/types";
import { safeFileName } from "@/lib/storage/upload-kinds";
import { blocksToMarkdown, renderInline, renderMath } from "./markdown";

type ExportNote = Pick<Note, "title" | "blocks">;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `# title` + the note body as markdown. */
export function exportMarkdown(note: ExportNote): string {
  return `# ${note.title}\n\n${blocksToMarkdown(note.blocks)}`;
}

/** Trigger a browser file download of `text`. No-op outside the browser. */
export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blockToHtml(block: Block): string {
  switch (block.type) {
    case "heading1":
      return `<h1>${renderInline(block.text)}</h1>`;
    case "heading2":
      return `<h2>${renderInline(block.text)}</h2>`;
    case "heading3":
      return `<h3>${renderInline(block.text)}</h3>`;
    case "paragraph":
      return `<p>${renderInline(block.text)}</p>`;
    case "bullet":
      return `<ul><li>${renderInline(block.text)}</li></ul>`;
    case "numbered":
      return `<ol><li>${renderInline(block.text)}</li></ol>`;
    case "todo":
      return `<p>${block.checked ? "☑" : "☐"} ${renderInline(block.text)}</p>`;
    case "quote":
      return `<blockquote>${renderInline(block.text)}</blockquote>`;
    case "callout":
      return `<blockquote>${block.emoji ? `${block.emoji} ` : ""}${renderInline(block.text)}</blockquote>`;
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "math":
      return `<div>${renderMath(block.text, true)}</div>`;
    case "divider":
      return "<hr/>";
    case "table": {
      const rows = block.rows ?? [];
      if (rows.length === 0) return "";
      const [head, ...body] = rows;
      const headHtml = `<tr>${head.map((c) => `<th>${renderInline(c)}</th>`).join("")}</tr>`;
      const bodyHtml = body
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
        .join("");
      return `<table border="1" cellspacing="0" cellpadding="4"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
    }
    default:
      return `<p>${renderInline(block.text)}</p>`;
  }
}

const PRINT_STYLE = `
  body { font-family: -apple-system, "Segoe UI", sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
  h1, h2, h3 { margin-top: 1.2em; }
  blockquote { border-left: 3px solid #ccc; margin: 0.5em 0; padding-left: 1em; color: #555; }
  pre { background: #f4f4f4; padding: 0.75em; border-radius: 4px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: left; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1.5em 0; }
  .katex-html { display: none; }
  .meta { color: #555; margin-top: 0; }
  h1.lesson { page-break-before: always; break-before: page; }
`;

/* KaTeX's HTML needs its stylesheet, which these files don't carry, so
   they show the MathML half only (browsers draw it natively). */

const WORD_HEAD = `<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->`;

/* One standalone HTML document: Word-flavoured for a .doc file, a plain
   page, or a page that opens the print dialog once it has loaded. */
function htmlDocument(title: string, body: string, mode: "word" | "page" | "print"): string {
  const open =
    mode === "word"
      ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
      : `<!doctype html>\n<html lang="en">`;
  return `${open}
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${mode === "word" ? WORD_HEAD : mode === "print" ? `<script>addEventListener("load", () => print());</script>` : ""}
<style>${PRINT_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function noteBody(note: ExportNote): string {
  return `<h1>${escapeHtml(note.title)}</h1>\n${note.blocks.map(blockToHtml).join("\n")}`;
}

/** A minimal Word-compatible HTML document string (suitable for saving as .doc). */
export function exportDocxHtml(note: ExportNote): string {
  return htmlDocument(note.title, noteBody(note), "word");
}

/** One-click PDF path: open a print window with the rendered note and call print(). */
export function printPdf(note: ExportNote): void {
  if (typeof window === "undefined") return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(htmlDocument(note.title, noteBody(note), "page"));
  win.document.close();
  win.focus();
  win.print();
}

/* ---- A course's notes in one file (feature 36) -----------------------------
   The published notes of the lessons a student picked, in curriculum order:
   the course's title and a contents list, then each lesson under its own
   heading (on a new page in Word and print). Built on the server by
   /courses/[courseId]/notes/export. */

export interface CombinedLesson {
  /* The lesson's number in the course, as the course page shows it. */
  number: number;
  title: string;
  moduleTitle: string;
  blocks: Block[];
}

export interface CombinedNotes {
  courseTitle: string;
  courseCode: string;
  lessons: CombinedLesson[];
}

export type CombinedFormat = "md" | "doc" | "print";

export function lessonHeading(lesson: Pick<CombinedLesson, "number" | "title">): string {
  return `Lesson ${lesson.number} · ${lesson.title}`;
}

function combinedTitle(notes: CombinedNotes): string {
  return `${notes.courseTitle}: notes`;
}

function combinedMeta(notes: CombinedNotes): string {
  const count = `${notes.lessons.length} ${notes.lessons.length === 1 ? "lesson" : "lessons"}`;
  return [notes.courseCode, count].filter(Boolean).join(" · ");
}

/* A lesson's title is the only top-level heading in its part, so its own
   top-level headings move down a level. */
function underLessonHeading(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.type === "heading1" ? { ...b, type: "heading2" } : b));
}

/** The combined notes as one Markdown file. */
export function exportCombinedMarkdown(notes: CombinedNotes): string {
  const contents = notes.lessons.map((l) => `- ${lessonHeading(l)}`).join("\n");
  const parts = notes.lessons.map(
    (l) => `# ${lessonHeading(l)}\n\n*${l.moduleTitle}*\n\n${blocksToMarkdown(underLessonHeading(l.blocks))}`,
  );
  return [`# ${combinedTitle(notes)}\n\n${combinedMeta(notes)}\n\n${contents}`, ...parts].join("\n\n---\n\n") + "\n";
}

function combinedBody(notes: CombinedNotes): string {
  const contents = notes.lessons.map((l) => `<li>${escapeHtml(lessonHeading(l))}</li>`).join("");
  const parts = notes.lessons.map(
    (l) =>
      `<h1 class="lesson">${escapeHtml(lessonHeading(l))}</h1>\n<p class="meta">${escapeHtml(l.moduleTitle)}</p>\n` +
      underLessonHeading(l.blocks).map(blockToHtml).join("\n"),
  );
  return [
    `<h1>${escapeHtml(combinedTitle(notes))}</h1>\n<p class="meta">${escapeHtml(combinedMeta(notes))}</p>\n<ul>${contents}</ul>`,
    ...parts,
  ].join("\n");
}

/** The combined notes as a Word-compatible .doc, or as a page that opens the print dialog (save as PDF). */
export function exportCombinedHtml(notes: CombinedNotes, mode: "word" | "print"): string {
  return htmlDocument(combinedTitle(notes), combinedBody(notes), mode);
}

/** `ma201-notes.md`: the download's name, from the course code (or title). */
export function combinedFileName(notes: Pick<CombinedNotes, "courseCode" | "courseTitle">, format: Exclude<CombinedFormat, "print">): string {
  const base = safeFileName(notes.courseCode || notes.courseTitle).replace(/[.-]+$/, "") || "course";
  return `${base}-notes.${format}`;
}
