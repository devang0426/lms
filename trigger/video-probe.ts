import { AbortTaskRunError, schemaTask } from "@trigger.dev/sdk";
import { assessProbe, probeLimitsFromEnv, type VideoFacts } from "@/lib/video/probe";
import { ffprobe } from "./lib/ffmpeg";
import { reportProgress } from "./lib/job-progress";
import { loadVideo, updateVideo, videoTaskPayload } from "./lib/video-db";

/* Step 3: is this an MP4 with H.264/AAC within the limits? ffprobe reads
   the Blob URL with range requests, so nothing is downloaded. A rejection
   is final (no retries) and its message is shown to the instructor. */
export const videoProbe = schemaTask({
  id: "video-probe",
  schema: videoTaskPayload,
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  run: async ({ videoId, parentRunId }): Promise<VideoFacts> => {
    const video = await loadVideo(videoId);
    if (video.durationSec && video.codec) {
      return {
        durationSec: video.durationSec,
        width: video.width ?? 0,
        height: video.height ?? 0,
        codec: video.codec,
        sizeBytes: video.sizeBytes ?? 0,
      };
    }

    await reportProgress(parentRunId, { stage: "probe", progress: 5, message: "Reading the video's format…" }, { asChild: true });
    const verdict = assessProbe(await ffprobe(video.blobUrl), probeLimitsFromEnv());
    if (!verdict.ok) {
      await updateVideo(videoId, { status: "rejected", error: verdict.message });
      throw new AbortTaskRunError(verdict.message);
    }

    const f = verdict.facts;
    await updateVideo(videoId, {
      durationSec: f.durationSec,
      width: f.width,
      height: f.height,
      codec: f.codec,
      sizeBytes: f.sizeBytes || video.sizeBytes,
    });
    return f;
  },
});
