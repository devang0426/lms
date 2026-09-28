import "server-only";

import type { IngestResult } from "./index";

function fileName(file: File | Blob): string | undefined {
  return typeof File !== "undefined" && file instanceof File ? file.name : undefined;
}

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^./\\]+$/, "")
    .trim()
    .slice(0, 80);
}

/* Extract text from every page with unpdf (a serverless build of pdf.js —
   runs in Node / Trigger.dev, no DOM or worker file needed). Returns the
   joined text plus per-page text so answers can cite "p. 7". Scanned PDFs
   (images only) yield empty text — OCR is a known gap. */
export async function ingestPdf(file: File | Blob): Promise<IngestResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, " ").trim());

    const joined = pages.join("\n\n").trim();
    const name = fileName(file);
    return {
      text: joined,
      pages,
      title: name ? titleFromFilename(name) : undefined,
      meta: { filename: name, pages: totalPages },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Couldn't extract text from that PDF (${reason}).`);
  }
}
