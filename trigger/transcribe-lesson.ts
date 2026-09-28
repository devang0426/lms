import { schemaTask } from "@trigger.dev/sdk";
import { asc, count, eq } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEngine } from "@/lib/ai/engine/server";
import { withUsage } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { transcriptSegments } from "@/lib/db/schema";
import { blobPaths, putBlob } from "@/lib/storage/blob";
import { segmentsToVtt, type CaptionSegment } from "@/lib/video/vtt";
import { durationOf, ffmpeg } from "./lib/ffmpeg";
import { reportProgress } from "./lib/job-progress";
import { loadVideo, updateVideo, videoTaskPayload } from "./lib/video-db";
import { removeDir, workDir } from "./lib/video-files";

/* Steps 6–7: audio → Whisper → transcript_segments + captions.vtt.
   The audio is cut with ffmpeg into 16 kHz mono MP3 pieces of 10 minutes
   (~2.4 MB, under the ~4 MB upload limit), so the engine never needs its
   browser-only chunker. Each piece's segments are shifted by the piece's
   real start time: timestamps are kept end to end (invariant 7).
   Idempotent: existing segments for this video are reused. */

const PIECE_SECONDS = 600;
const MIN_PIECE_SECONDS = 1;
const INSERT_BATCH = 500;

export const transcribeLesson = schemaTask({
  id: "transcribe-lesson",
  schema: videoTaskPayload,
  retry: { maxAttempts: 2 },
  maxDuration: 3600,
  run: async ({ videoId, parentRunId }) => {
    const video = await loadVideo(videoId);
    const report = (stage: string, progress: number, message: string) =>
      reportProgress(parentRunId, { stage, progress, message }, { asChild: true });

    const [{ n: existing }] = await db
      .select({ n: count() })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.videoId, videoId));

    let segments: CaptionSegment[];
    if (existing > 0) {
      if (video.vttUrl) return { segments: existing, skipped: true };
      segments = await db
        .select({ startSec: transcriptSegments.startSec, endSec: transcriptSegments.endSec, text: transcriptSegments.text })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.videoId, videoId))
        .orderBy(asc(transcriptSegments.idx));
    } else {
      segments = await transcribe(video, report);
      await report("transcribe", 55, `Saving ${segments.length} transcript segments…`);
      const rows = segments.map((s, idx) => ({ lessonId: video.lessonId, videoId, idx, ...s }));
      const inserts = [];
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        inserts.push(db.insert(transcriptSegments).values(rows.slice(i, i + INSERT_BATCH)));
      }
      // One batch = one transaction: all segments or none.
      const [first, ...rest] = inserts;
      if (first) await db.batch([first, ...rest]);
    }

    await report("captions", 58, "Writing captions…");
    const blob = await putBlob(blobPaths.videoCaptions(video.lessonId), segmentsToVtt(segments), {
      contentType: "text/vtt",
    });
    await updateVideo(videoId, { vttUrl: blob.url });
    return { segments: segments.length, skipped: false };
  },
});

async function transcribe(
  video: Awaited<ReturnType<typeof loadVideo>>,
  report: (stage: string, progress: number, message: string) => Promise<void>,
): Promise<CaptionSegment[]> {
  const dir = await workDir(`audio-${video.id}`);
  try {
    await report("audio", 22, "Extracting the sound track…");
    await ffmpeg([
      "-i", video.blobUrl,
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
      "-f", "segment", "-segment_time", String(PIECE_SECONDS), "-reset_timestamps", "1",
      join(dir, "piece-%03d.mp3"),
    ]);
    const pieces = (await readdir(dir)).filter((f) => f.startsWith("piece-")).sort();
    if (pieces.length === 0) throw new Error("No audio could be extracted from this video.");

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
        await report("transcribe", 25 + Math.round((28 * i) / pieces.length), `Transcribing part ${i + 1} of ${pieces.length}…`);
        const audio = new Blob([await readFile(file)], { type: "audio/mpeg" });
        const result = await withUsage("transcribe", video.createdBy, () => engine.transcribe(audio));
        for (const s of result.segments) {
          const text = s.text.trim();
          if (!text) continue;
          // Whisper can run a little past the end; captions shouldn't.
          const end = video.durationSec ? Math.min(s.end + offset, video.durationSec) : s.end + offset;
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
