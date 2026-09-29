/* Document → retrieval chunks (feature 18). Pure: no db, no engine.

   A chunk never crosses a part, so it keeps the part's page, section or
   time for its citation ("Week 2 slides · p. 7"). Long pages and sections
   are cut into windows of about 1,200 characters on sentence boundaries,
   overlapping by about 150 characters. A recording's parts are its
   transcript segments and go through the transcript chunker. Each chunk
   opens with a header line — the document title and where in it — then a
   blank line (the assistant strips the header when quoting). */

import type { DocPart } from "@/lib/ai/types";
import { chunkTranscript } from "./chunk-transcript";

export interface DocumentChunk {
  text: string;
  page: number | null;
  section: string | null;
  startSec: number | null;
  endSec: number | null;
}

export const DOC_CHUNK_CHARS = 1200;
export const DOC_CHUNK_OVERLAP = 150;

export function chunkDocument(title: string, parts: readonly DocPart[]): DocumentChunk[] {
  const timed = parts.filter((p) => p.startSec !== undefined && p.text.trim());
  if (timed.length > 0) {
    const segments = timed.map((p) => ({ startSec: p.startSec!, endSec: p.endSec ?? p.startSec!, text: p.text }));
    return chunkTranscript(segments, []).map((c) => ({
      text: `${title}\n\n${c.text}`,
      page: null,
      section: null,
      startSec: c.startSec,
      endSec: c.endSec,
    }));
  }

  return parts.flatMap((part) => {
    const header = [title, part.page !== undefined ? `p. ${part.page}` : null, part.section ?? null].filter(Boolean).join(" · ");
    return windows(part.text).map((body) => ({
      text: `${header}\n\n${body}`,
      page: part.page ?? null,
      section: part.section ?? null,
      startSec: null,
      endSec: null,
    }));
  });
}

/* Sentences, with very long ones cut at the size limit. */
function sentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const out: string[] = [];
  for (const s of flat.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [flat]) {
    for (let i = 0; i < s.length; i += DOC_CHUNK_CHARS) out.push(s.slice(i, i + DOC_CHUNK_CHARS));
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function windows(text: string): string[] {
  const list = sentences(text);
  const out: string[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    let size = list[i].length;
    while (j + 1 < list.length && size + 1 + list[j + 1].length <= DOC_CHUNK_CHARS) size += 1 + list[++j].length;
    out.push(list.slice(i, j + 1).join(" "));
    if (j === list.length - 1) break;
    // Step back over the last ~150 characters, always moving forward.
    let next = j + 1;
    let overlap = 0;
    while (next - 1 > i && overlap + list[next - 1].length <= DOC_CHUNK_OVERLAP) overlap += list[--next].length;
    i = next;
  }
  return out;
}
