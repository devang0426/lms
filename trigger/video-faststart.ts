import { schemaTask } from "@trigger.dev/sdk";
import { join } from "node:path";
import { putBlob } from "@/lib/storage/blob";
import { ffmpeg } from "./lib/ffmpeg";
import { reportProgress } from "./lib/job-progress";
import { loadVideo, updateVideo, videoTaskPayload } from "./lib/video-db";
import { downloadTo, isFaststart, readStream, removeDir, workDir } from "./lib/video-files";

/* Step 4: move the `moov` atom to the front so playback and seeking start
   before the whole file downloads. A stream copy — never a re-encode — and
   only when needed; the result replaces the original at the same pathname. */
export const videoFaststart = schemaTask({
  id: "video-faststart",
  schema: videoTaskPayload,
  retry: { maxAttempts: 3 },
  maxDuration: 1800,
  run: async ({ videoId, parentRunId }) => {
    const video = await loadVideo(videoId);
    if (video.faststart) return { remuxed: false, skipped: true };

    const dir = await workDir(`faststart-${videoId}`);
    try {
      await reportProgress(parentRunId, { stage: "faststart", progress: 12, message: "Downloading the upload…" }, { asChild: true });
      const src = join(dir, "source.mp4");
      await downloadTo(video.blobUrl, src);

      if (await isFaststart(src)) {
        await updateVideo(videoId, { faststart: true });
        return { remuxed: false, skipped: false };
      }

      await reportProgress(parentRunId, { stage: "faststart", progress: 18, message: "Moving the index to the front (no re-encode)…" }, { asChild: true });
      const out = join(dir, "faststart.mp4");
      await ffmpeg(["-i", src, "-c", "copy", "-movflags", "+faststart", out]);

      await reportProgress(parentRunId, { stage: "faststart", progress: 22, message: "Saving the streamable version…" }, { asChild: true });
      const blob = await putBlob(video.pathname, readStream(out), {
        contentType: "video/mp4",
        overwrite: true,
        multipart: true,
      });
      await updateVideo(videoId, { faststart: true, blobUrl: blob.url });
      return { remuxed: true, skipped: false };
    } finally {
      await removeDir(dir);
    }
  },
});
