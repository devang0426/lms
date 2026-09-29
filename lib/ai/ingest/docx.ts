import "server-only";

import type { IngestResult } from "./index";
import { htmlToSections, partsText } from "./sections";

function fileName(file: File | Blob): string | undefined {
  return typeof File !== "undefined" && file instanceof File ? file.name : undefined;
}

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^./\\]+$/, "")
    .trim()
    .slice(0, 80);
}

/* A .docx via mammoth (feature 18: headings kept as sections). mammoth maps
   Word's Heading 1–3 styles to <h1>–<h3>, which split the text into
   citable sections. The import is lazy so mammoth only loads when needed. */
export async function ingestDocx(file: File | Blob): Promise<IngestResult> {
  let html: string;
  try {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    html = (await mammoth.convertToHtml({ buffer })).value;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Couldn't read that Word document (${reason}). Save it again as .docx and retry.`);
  }
  const parts = htmlToSections(html);
  const name = fileName(file);
  return {
    text: partsText(parts),
    parts,
    title: name ? titleFromFilename(name) : undefined,
    meta: { filename: name },
  };
}
