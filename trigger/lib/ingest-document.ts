import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestDocx } from "@/lib/ai/ingest/docx";
import { ingestPdf } from "@/lib/ai/ingest/pdf";
import { ingestUrl } from "@/lib/ai/ingest/url";
import { canonicalYoutubeUrl, youtubeFailureMessage } from "@/lib/ai/ingest/youtube";
import { extractYoutube } from "@/lib/ai/ingest/youtube/ytdlp.mjs";
import type { DocPart } from "@/lib/ai/types";
import type { DocumentRow } from "@/lib/db/schema";
import { documentMaxSec, tooLongMessage } from "@/lib/documents/length";
import { SafeFetchError } from "@/lib/net/safe-fetch";
import { durationOf } from "./ffmpeg";
import { JobError } from "./job-progress";
import { transcribeAudio } from "./transcribe";
import { downloadTo, removeDir, workDir } from "./video-files";

/* Step 1 of ingest-document (feature 18): turn one document into text and
   citable parts. PDF: one part per page (unpdf). DOCX: one per heading
   section (mammoth). Web page: fetched through the SSRF guard, then
   Readability, one part per section. Recording: the same Whisper step as
   video, one part per transcript segment. YouTube: yt-dlp captions, or its
   audio through Whisper; YouTube often blocks servers, which ends in a
   message saying to upload the file instead. Recordings and YouTube
   videos over DOCUMENT_MAX_MINUTES are refused before anything is
   transcribed (feature 25, S2): a recording by ffprobe, a YouTube video by
   yt-dlp's metadata, before it downloads anything. */

export interface Extracted {
  title?: string;
  text: string;
  parts: DocPart[];
  pageCount?: number | null;
  durationSec?: number | null;
}

export type ExtractReport = (stage: "read" | "transcribe", fraction: number, message: string) => Promise<void>;

const MIN_TEXT = 100;

export async function extractDocument(doc: DocumentRow, report: ExtractReport = async () => {}): Promise<Extracted> {
  switch (doc.kind) {
    case "pdf": {
      await report("read", 0, "Reading the PDF page by page…");
      const result = await readable(() => fromDisk(doc, ingestPdf));
      if (result.text.length < MIN_TEXT) {
        throw new JobError("This PDF has almost no text we can read. It's probably scanned: export it with text recognition (OCR) and upload it again.");
      }
      return { text: result.text, parts: result.parts ?? [], pageCount: result.pages?.length ?? null };
    }
    case "docx": {
      await report("read", 0, "Reading the Word document…");
      const result = await readable(() => fromDisk(doc, ingestDocx));
      if (result.text.length < MIN_TEXT) throw new JobError("This document has almost no text in it.");
      return { text: result.text, parts: result.parts ?? [] };
    }
    case "url": {
      await report("read", 0, "Fetching the page…");
      if (!doc.url) throw new JobError("This link is missing its address.");
      const result = await readable(() => ingestUrl(doc.url!));
      return { title: result.title, text: result.text, parts: result.parts ?? [] };
    }
    case "audio": {
      if (!doc.blobUrl) throw new JobError("The recording didn't finish uploading. Upload it again.");
      const maxSec = documentMaxSec();
      const durationSec = await durationOf(doc.blobUrl);
      refuseTooLong("audio", durationSec, maxSec);
      const segments = await transcribeAudio(doc.blobUrl, { label: doc.id, userId: doc.createdBy, durationSec, maxSec, report: stageReport(report) });
      return timed(segments, durationSec);
    }
    case "youtube":
      return extractYoutubeDoc(doc, report);
    default: {
      const never: never = doc.kind;
      throw new JobError(`Unknown document kind ${String(never)}.`);
    }
  }
}

async function extractYoutubeDoc(doc: DocumentRow, report: ExtractReport): Promise<Extracted> {
  const url = doc.url ? canonicalYoutubeUrl(doc.url) : null;
  if (!url) throw new JobError("That doesn't look like a YouTube link.");
  await report("read", 0, "Asking YouTube for captions…");
  const maxSec = documentMaxSec();
  const dir = await workDir(`youtube-${doc.id}`);
  try {
    let got: Awaited<ReturnType<typeof extractYoutube>>;
    try {
      const binDir = join(tmpdir(), "studyhall-bin");
      await mkdir(binDir, { recursive: true });
      got = await extractYoutube(url, binDir, { audioDir: dir, maxDurationSec: maxSec });
    } catch (err) {
      console.warn("[ingest-document] yt-dlp failed", err);
      throw new JobError(youtubeFailureMessage(err));
    }
    // The length from YouTube's metadata, checked before any download.
    if (got.tooLong) refuseTooLong("youtube", got.durationSec ?? 0, maxSec);
    const title = got.title ?? undefined;
    if (got.cues?.length) {
      const segments = got.cues.map((c: { start: number; end: number; text: string }) => ({ startSec: c.start, endSec: c.end, text: c.text }));
      // YouTube didn't say how long it is: the captions do.
      refuseTooLong("youtube", segments.at(-1)?.endSec ?? 0, maxSec);
      return { ...timed(segments, segments.at(-1)?.endSec ?? null), title };
    }
    if (!got.audioPath) throw new JobError(youtubeFailureMessage("no captions or audio"));
    const durationSec = await durationOf(got.audioPath);
    refuseTooLong("youtube", durationSec, maxSec);
    const segments = await transcribeAudio(got.audioPath, { label: doc.id, userId: doc.createdBy, durationSec, maxSec, report: stageReport(report) });
    return { ...timed(segments, durationSec), title };
  } finally {
    await removeDir(dir);
  }
}

function refuseTooLong(kind: "audio" | "youtube", durationSec: number, maxSec: number): void {
  const message = tooLongMessage(kind, durationSec, maxSec);
  if (message) throw new JobError(message);
}

function timed(segments: { startSec: number; endSec: number; text: string }[], durationSec: number | null): Extracted {
  const parts = segments.filter((s) => s.text.trim()).map((s) => ({ startSec: s.startSec, endSec: s.endSec, text: s.text.trim() }));
  if (parts.length === 0) throw new JobError("No speech was found in this recording.");
  return { text: parts.map((p) => p.text).join(" "), parts, durationSec };
}

const stageReport =
  (report: ExtractReport) =>
  (stage: "audio" | "transcribe", fraction: number, message: string) =>
    report(stage === "audio" ? "read" : "transcribe", fraction, message);

/* PDF and Word files stream to a temp file instead of into memory
   (feature 26): res.blob(), its arrayBuffer() and pdf.js each held a copy
   of the file, and a 200 MB PDF could crash the default machine. The file
   is then read in one allocation of its exact size and handed over as a
   plain Uint8Array, which pdf.js uses without copying. */
async function fromDisk<T>(doc: DocumentRow, extract: (bytes: Uint8Array) => Promise<T>): Promise<T> {
  if (!doc.blobUrl) throw new JobError("The file didn't finish uploading. Upload it again.");
  const dir = await workDir(`doc-${doc.id}`);
  try {
    const file = join(dir, "source");
    try {
      await downloadTo(doc.blobUrl, file);
    } catch (err) {
      console.warn("[ingest-document] download failed", err);
      throw new Error("Couldn't download the file. Upload it again.");
    }
    const bytes = await readFile(file);
    // pdf.js copies a Buffer, but not a Uint8Array that spans its whole ArrayBuffer.
    return await extract(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } finally {
    await removeDir(dir);
  }
}

/* Extractors throw plain Errors written for people ("Couldn't read that
   Word document…") and SafeFetchError for links: both are safe to show. */
async function readable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof JobError) throw err;
    if (err instanceof SafeFetchError) throw new JobError(err.message);
    console.warn("[ingest-document] extraction failed", err);
    const message = err instanceof Error && /^(Couldn't|That page|That link)/.test(err.message) ? err.message : "This document couldn't be read.";
    throw new JobError(message);
  }
}
