import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { moovBeforeMdat } from "@/lib/video/mp4-atoms";

/* Temp files for video tasks. Everything streams: a 2 GB lecture never
   sits in memory. Always pair workDir() with removeDir() in a finally. */

export async function workDir(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `studyhall-${label}-`));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function downloadTo(url: string, file: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(file));
  return (await stat(file)).size;
}

export function readStream(file: string) {
  return createReadStream(file);
}

/* true = already streamable (moov first), false = needs the remux,
   null = couldn't tell (treated as "needs it"). */
export async function isFaststart(file: string): Promise<boolean | null> {
  const { size } = await stat(file);
  const fh = await open(file, "r");
  try {
    return await moovBeforeMdat(async (position, length) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, position);
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    }, size);
  } finally {
    await fh.close();
  }
}
