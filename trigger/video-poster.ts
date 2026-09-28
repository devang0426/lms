import { schemaTask } from "@trigger.dev/sdk";
import { join } from "node:path";
import { blobPaths, putBlob } from "@/lib/storage/blob";
import { ffmpeg } from "./lib/ffmpeg";
import { reportProgress } from "./lib/job-progress";
import { loadVideo, updateVideo, videoTaskPayload } from "./lib/video-db";
import { readStream, removeDir, workDir } from "./lib/video-files";

/* Step 5: one frame at ~10% of the running time, as poster.jpg (at most
   1280px wide). ffmpeg seeks inside the Blob URL, so only nearby bytes are
   fetched. Skips if the poster already exists. */
export const videoPoster = schemaTask({
  id: "video-poster",
  schema: videoTaskPayload,
  retry: { maxAttempts: 3 },
  maxDuration: 600,
  run: async ({ videoId, parentRunId }) => {
    const video = await loadVideo(videoId);
    if (video.posterUrl) return { posterUrl: video.posterUrl, skipped: true };

    await reportProgress(parentRunId, { stage: "poster", progress: 26, message: "Picking a frame…" }, { asChild: true });
    const dir = await workDir(`poster-${videoId}`);
    try {
      const at = Math.max(0, (video.durationSec ?? 0) * 0.1);
      const out = join(dir, "poster.jpg");
      await ffmpeg(["-ss", at.toFixed(2), "-i", video.blobUrl, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", out]);
      const blob = await putBlob(blobPaths.videoPoster(video.lessonId), readStream(out), { contentType: "image/jpeg" });
      await updateVideo(videoId, { posterUrl: blob.url });
      return { posterUrl: blob.url, skipped: false };
    } finally {
      await removeDir(dir);
    }
  },
});
