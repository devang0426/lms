import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import type { CaptionSegment } from "@/lib/video/vtt";
import { durationOf, ffmpeg } from "./ffmpeg";
import { JobError } from "./job-progress";
import { removeDir, workDir } from "./video-files";

/* Audio → Whisper → timed segments (features 10 and 18). `input` is
   anything ffmpeg reads: a video's Blob URL, an uploaded recording, or a
   downloaded YouTube audio file. The audio is cut with ffmpeg into 16 kHz
   mono MP3 pieces of 10 minutes (~2.4 MB, under the ~4 MB upload limit),
   so the engine never needs its browser-only chunker. Each piece's
   segments are shifted by the piece's real start time: timestamps are
   kept end to end (invariant 7).

   `maxSec` (documents, feature 25): the caller checks the length first,
   but ffprobe can't always tell. So a source that cuts into more pieces
   than that length allows is refused here, before any Whisper call. */

const PIECE_SECONDS = 600;
const MIN_PIECE_SECONDS = 1;

export type TranscribeReport = (stage: "audio" | "transcribe", fraction: number, message: string) => Promise<void>;

export async function transcribeAudio(
  input: string,
  opts: { label: string; userId: string | null; durationSec?: number | null; maxSec?: number; report?: TranscribeReport },
): Promise<CaptionSegment[]> {
  const dir = await workDir(`audio-${opts.label}`);
  try {
    await opts.report?.("audio", 0, "Extracting the sound track…");
    await ffmpeg([
      "-i", input,
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
      "-f", "segment", "-segment_time", String(PIECE_SECONDS), "-reset_timestamps", "1",
      join(dir, "piece-%03d.mp3"),
    ]);
    const pieces = (await readdir(dir)).filter((f) => f.startsWith("piece-")).sort();
    if (pieces.length === 0) throw new Error("No audio could be extracted from this file.");
    if (opts.maxSec && pieces.length > Math.ceil(opts.maxSec / PIECE_SECONDS)) {
      throw new JobError(`This is over ${Math.round(opts.maxSec / 60)} minutes long, the longest we can take. Trim it, or split it into parts.`);
    }

    const engine = getEngine();
    const out: CaptionSegment[] = [];
    let offset = 0;
    for (let i = 0; i < pieces.length; i++) {
      const file = join(dir, pieces[i]);
      const length = await durationOf(file);
      // The segmenter can leave a sliver past the last full piece (e.g. a
      // 20:00.03 lecture → a 0.03 s third piece). Whisper rejects audio that
      // short with a 400, and it holds no speech, so skip it.
      if (length >= MIN_PIECE_SECONDS) {
        await opts.report?.("transcribe", i / pieces.length, `Transcribing part ${i + 1} of ${pieces.length}…`);
        const audio = new Blob([await readFile(file)], { type: "audio/mpeg" });
        const result = await withUsage("transcribe", opts.userId, () => engine.transcribe(audio));
        for (const s of result.segments) {
          const text = s.text.trim();
          if (!text) continue;
          // Whisper can run a little past the end; captions shouldn't.
          const end = opts.durationSec ? Math.min(s.end + offset, opts.durationSec) : s.end + offset;
          out.push({ startSec: round3(s.start + offset), endSec: round3(Math.max(end, s.start + offset)), text });
        }
      }
      // The next piece starts where this one really ended, not at i × 600.
      offset += length || PIECE_SECONDS;
    }
    return out;
  } finally {
    await removeDir(dir);
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
