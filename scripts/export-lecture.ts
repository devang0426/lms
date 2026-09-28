/* Save a processed lesson as the demo lecture fixture (feature 12).
     npm run demo:export-lecture -- <lessonId> "<target lesson title>"

   Copies the video, poster and captions to demo/lecture/ in Blob, so the
   seeded lecture doesn't depend on the source lesson (replacing that
   lesson's video deletes its own files), then writes the transcript and
   the lesson's current chapters, notes, cards and quiz — edits included —
   to scripts/demo-assets/lecture.json. `npm run db:seed` loads it. */

import { copy } from "@vercel/blob";
import { asc, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PROMPTS_VERSION } from "@/lib/ai/prompts";
import { db } from "@/lib/db/client";
import { getLessonContent, loadLessonSource } from "@/lib/db/lesson-content";
import { transcriptSegments, videos } from "@/lib/db/schema";
import { BLOB_ACCESS } from "@/lib/storage/blob";
import { DEMO_LECTURE_PREFIX } from "@/lib/storage/upload-kinds";
import { LECTURE_FIXTURE_PATH, lectureFixture, type LectureFixture } from "./lib/lecture-fixture";

async function copyToDemo(url: string | null, name: string): Promise<{ url: string; pathname: string } | null> {
  if (!url) return null;
  const blob = await copy(url, `${DEMO_LECTURE_PREFIX}${name}`, { access: BLOB_ACCESS, addRandomSuffix: true });
  return { url: blob.url, pathname: blob.pathname };
}

async function main() {
  const [lessonId, lessonTitle] = process.argv.slice(2);
  if (!lessonId || !lessonTitle) {
    console.error('Usage: npm run demo:export-lecture -- <lessonId> "<target lesson title>"');
    process.exit(1);
  }
  const source = await loadLessonSource(lessonId);
  if (!source) throw new Error("That lesson has no processed (ready) video.");
  const [video] = await db.select().from(videos).where(eq(videos.id, source.videoId));
  const content = await getLessonContent(lessonId, { publishedOnly: false });
  if (content.chapters.length === 0 || !content.note) throw new Error("Draft the chapters and notes before exporting.");

  console.log("Copying video files to demo/lecture/ …");
  const mp4 = await copyToDemo(video.blobUrl, "source.mp4");
  const poster = await copyToDemo(video.posterUrl, "poster.jpg");
  const vtt = await copyToDemo(video.vttUrl, "captions.vtt");
  if (!mp4) throw new Error("The video has no file.");

  const segments = await db
    .select({ startSec: transcriptSegments.startSec, endSec: transcriptSegments.endSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, source.videoId))
    .orderBy(asc(transcriptSegments.idx));

  const fixture: LectureFixture = lectureFixture.parse({
    version: 1,
    lessonTitle,
    promptsVersion: PROMPTS_VERSION,
    video: {
      blobUrl: mp4.url,
      pathname: mp4.pathname,
      posterUrl: poster?.url ?? null,
      vttUrl: vtt?.url ?? null,
      durationSec: video.durationSec ?? source.durationSec,
      width: video.width,
      height: video.height,
      codec: video.codec,
      sizeBytes: video.sizeBytes,
    },
    segments,
    chapters: content.chapters.map((c) => ({ title: c.title, startSec: c.startSec, summary: c.summary })),
    note: { title: content.note.title, blocks: content.note.blocks },
    cards: content.cards.map((c) => ({ front: c.front, back: c.back, topic: c.topic, startSec: c.startSec })),
    questions: content.questions.map((q) => ({
      type: q.type,
      difficulty: q.difficulty,
      bank: q.bank,
      topic: q.topic,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      startSec: q.startSec,
    })),
  });

  await mkdir(dirname(LECTURE_FIXTURE_PATH), { recursive: true });
  await writeFile(LECTURE_FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(
    `✓ Wrote ${LECTURE_FIXTURE_PATH}: ${segments.length} segments, ${fixture.chapters.length} chapters, ` +
      `${fixture.cards.length} cards, ${fixture.questions.length} questions → "${lessonTitle}"`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Export failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
