import { schemaTask } from "@trigger.dev/sdk";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transcriptSegments } from "@/lib/db/schema";
import { blobPaths, putBlob } from "@/lib/storage/blob";
import { segmentsToVtt, type CaptionSegment } from "@/lib/video/vtt";
import { reportProgress } from "./lib/job-progress";
import { transcribeAudio } from "./lib/transcribe";
import { loadVideo, updateVideo, videoTaskPayload } from "./lib/video-db";

/* Steps 6–7: audio → Whisper (trigger/lib/transcribe.ts) →
   transcript_segments + captions.vtt. Idempotent: existing segments for
   this video are reused. */

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
  return transcribeAudio(video.blobUrl, {
    label: video.id,
    userId: video.createdBy,
    durationSec: video.durationSec,
    report: (stage, fraction, message) => report(stage, stage === "audio" ? 22 : 25 + Math.round(28 * fraction), message),
  });
}
