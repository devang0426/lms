import { formatTime } from "@/lib/time";

/* Documents as the browser sees them (feature 18). Pure and shared by the
   editor, the player's Resources tab and citation chips. The file's Blob
   URL is never sent to the browser: links go through /documents/[id],
   which checks access and then redirects to the file. */

export type DocumentKindView = "pdf" | "docx" | "url" | "audio" | "youtube";

export interface DocumentView {
  id: string;
  kind: DocumentKindView;
  title: string;
  status: "uploading" | "processing" | "ready" | "failed";
  pageCount: number | null;
  durationSec: number | null;
  sizeBytes: number | null;
  /* A downloadable file (not a link to someone else's page). */
  hasFile: boolean;
}

export const KIND_LABELS: Record<DocumentKindView, string> = {
  pdf: "PDF",
  docx: "Word",
  url: "Web page",
  audio: "Recording",
  youtube: "YouTube",
};

export function documentMeta(doc: Pick<DocumentView, "pageCount" | "durationSec" | "sizeBytes">): string[] {
  const out: string[] = [];
  if (doc.pageCount) out.push(`${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}`);
  if (doc.durationSec) out.push(formatTime(doc.durationSec));
  if (doc.sizeBytes) out.push(formatBytes(doc.sizeBytes));
  return out;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* Open the document at a page (PDF viewers read #page=) or a moment
   (browsers play a recording from #t=). */
export function documentHref(documentId: string, at: { page?: number | null; startSec?: number | null } = {}): string {
  const base = `/documents/${documentId}`;
  if (at.page) return `${base}#page=${at.page}`;
  if (at.startSec !== null && at.startSec !== undefined) return `${base}#t=${Math.floor(at.startSec)}`;
  return base;
}

export function documentDownloadHref(documentId: string): string {
  return `/documents/${documentId}?download=1`;
}
