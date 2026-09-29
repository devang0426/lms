import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { concatList } from "@/lib/ai/audio/concat";
import { durationOf, ffmpeg } from "./ffmpeg";

/* Join a podcast's spoken lines into one MP3 (feature 17) with the ffmpeg
   concat demuxer. The pieces are decoded and encoded once more as a single
   stream, so the file has one correct header and duration, even if the
   TTS provider changed its sample rate or bitrate between lines. It's
   speech, so 64 kbps mono is plenty. */

const GAP_SEC = 0.35;
const OUTPUT = ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "64k"];

export async function joinPodcastAudio(parts: readonly Blob[], dir: string): Promise<{ file: string; durationSec: number }> {
  const names = parts.map((_, i) => `line-${String(i).padStart(3, "0")}.mp3`);
  await Promise.all(parts.map(async (part, i) => writeFile(join(dir, names[i]), Buffer.from(await part.arrayBuffer()))));

  // A short silence between speakers, in the same format as the output.
  await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(GAP_SEC), ...OUTPUT, join(dir, "gap.mp3")]);

  const list = join(dir, "list.txt");
  await writeFile(list, concatList(names, "gap.mp3"));
  const file = join(dir, "episode.mp3");
  await ffmpeg(["-f", "concat", "-i", list, "-vn", ...OUTPUT, file], 10 * 60_000);
  return { file, durationSec: await durationOf(file) };
}
