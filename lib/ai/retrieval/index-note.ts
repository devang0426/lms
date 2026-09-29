import "server-only";

import { deleteNoteChunks, replaceNoteChunks, type NewLessonChunk } from "@/lib/db/chunks";
import { loadNoteIndexSource } from "@/lib/db/space";
import { chunkDocument } from "./chunk-document";
import { EMBEDDING_MODEL, embedPassages } from "./embed";

/* Index a private note for its owner's chat (feature 19): the source's
   pages, sections or times, cut like a lesson document (chunk-document.ts),
   embedded, then swapped in at once. The chunks carry the owner, the note
   and the document, and no course, so only the owner's searches find
   them. Run by the index-note task once the note's drafts are saved. */

export type NoteIndexResult = { status: "indexed"; chunks: number } | { status: "gone" | "empty"; chunks: 0 };

export async function indexNoteChunks(
  noteId: string,
  opts: { report?: (fraction: number, message: string) => Promise<void> } = {},
): Promise<NoteIndexResult> {
  const src = await loadNoteIndexSource(noteId);
  if (!src) return { status: "gone", chunks: 0 };

  const chunks: Omit<NewLessonChunk, "embedding">[] = src.documents.flatMap((d) =>
    chunkDocument(d.title, d.parts).map((c) => ({ kind: "doc" as const, documentId: d.id, ...c })),
  );
  if (chunks.length === 0) {
    await deleteNoteChunks(noteId);
    return { status: "empty", chunks: 0 };
  }

  const embeddings = await embedPassages(
    chunks.map((c) => c.text),
    {
      feature: "space-index",
      userId: src.ownerId,
      failMessage: "The search model returned an unexpected answer, so your note wasn't made searchable. Try again.",
      report: opts.report,
    },
  );
  const written = await replaceNoteChunks({
    noteId,
    ownerId: src.ownerId,
    model: EMBEDDING_MODEL,
    chunks: chunks.map((c, i) => ({ ...c, embedding: embeddings[i] })),
  });
  return written ? { status: "indexed", chunks: chunks.length } : { status: "gone", chunks: 0 };
}
