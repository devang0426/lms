import { getEngine } from "@/lib/ai/engine/server";
import { generatePodcastScript, PODCAST_VOICES_BY_LANGUAGE, synthesizePodcastLines } from "@/lib/ai/generation/podcast";
import { withUsage } from "@/lib/ai/usage";
import { PODCAST_PROMPTS_VERSION } from "@/lib/ai/prompts";
import { loadPodcastJob, markPodcastReady, savePodcastEpisode } from "@/lib/db/podcasts";
import { blobPaths, deleteBlobs, putBlob } from "@/lib/storage/blob";
import { JobError } from "./job-progress";
import { joinPodcastAudio } from "./podcast-audio";
import { readStream, removeDir, workDir } from "./video-files";

/* The generate-podcast task body (feature 17): script → one TTS call per
   line → ffmpeg join → Blob → one row update. Nothing is saved until the
   episode is complete, so an older episode stays playable through a
   failed regeneration. The whole run's AI cost (script and speech) is
   logged under "podcast", attributed to whoever asked. A private note's
   episode (feature 19) is made from the note, logged under
   "space-podcast", and saved in its owner's private folder. Each language
   (English, Hinglish) is its own episode, with its own script prompt and
   pair of voices. */

export type PodcastReport = (stage: "script" | "voices" | "mix" | "save", progress: number, message: string) => Promise<void>;

export async function makePodcast(podcastId: string, report: PodcastReport = async () => {}) {
  const job = await loadPodcastJob(podcastId);
  if (!job) throw new JobError("This podcast no longer exists.");
  if (!job.source) {
    throw new JobError(
      job.ownerId ? "Your notes aren't written yet, so there's nothing to talk about." : "The lesson notes aren't published, so there's nothing to talk about yet.",
    );
  }
  const { podcast, source, ownerId } = job;
  // Up to date already (e.g. a duplicate run): never make it again.
  if (podcast.audioUrl && podcast.sourceHash === source.hash && podcast.promptsVersion === PODCAST_PROMPTS_VERSION) {
    await markPodcastReady(podcastId);
    return { skipped: true, lines: podcast.script.length };
  }

  const engine = getEngine();
  const { script, parts } = await withUsage(ownerId ? "space-podcast" : "podcast", podcast.requestedBy, async () => {
    await report("script", 5, "Writing the conversation…");
    const script = await generatePodcastScript(engine, `# ${job.title}\n\n${source.text}`, podcast.length, podcast.language);
    await report("voices", 30, `Recording ${script.length} lines…`);
    let last = 0;
    const parts = await synthesizePodcastLines(engine, script, {
      voices: PODCAST_VOICES_BY_LANGUAGE[podcast.language],
      onLine: (done, total) => {
        // Report every few lines: each report is a metadata flush and a db write.
        if (done - last >= 3 || done === total) {
          last = done;
          report("voices", 30 + Math.round((55 * done) / total), `Recorded ${done} of ${total} lines…`).catch(() => {});
        }
      },
    });
    return { script, parts };
  });

  const dir = await workDir(`podcast-${podcastId}`);
  try {
    await report("mix", 88, "Joining the audio…");
    const { file, durationSec } = await joinPodcastAudio(parts, dir);
    await report("save", 95, "Saving the episode…");
    // English keeps its original file names; other languages add a suffix.
    const suffix = podcast.language === "en" ? "" : `-${podcast.language}`;
    const pathname = ownerId
      ? blobPaths.private(ownerId, `podcast-${podcast.noteId}-${podcast.length}${suffix}.mp3`)
      : blobPaths.podcast(podcast.lessonId!, `${podcast.length}${suffix}`);
    const blob = await putBlob(pathname, readStream(file), { contentType: "audio/mpeg" });
    await savePodcastEpisode(podcastId, {
      script,
      audioUrl: blob.url,
      audioPathname: blob.pathname,
      durationSec: Math.round(durationSec * 1000) / 1000,
      sourceHash: source.hash,
    });
    if (podcast.audioUrl && podcast.audioUrl !== blob.url) {
      // The old episode is unreachable now; losing it only costs storage.
      await deleteBlobs([podcast.audioUrl]).catch((err) => console.warn("[podcast] old audio not deleted", err));
    }
    return { skipped: false, lines: script.length, durationSec };
  } finally {
    await removeDir(dir);
  }
}
