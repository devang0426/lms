import { z } from "zod";

/* The demo lecture fixture (feature 12): a fully processed lesson — video
   files, transcript, chapters, notes, cards and quiz — saved as JSON so
   `npm run db:seed` gives a published lecture without running the
   pipeline. Written by scripts/export-lecture.ts, read by seedLecture(). */

export const LECTURE_FIXTURE_PATH = "scripts/demo-assets/lecture.json";

const sec = z.number().finite().min(0);

export const lectureFixture = z.object({
  version: z.literal(1),
  /* Which demo lesson the lecture is loaded into (matched by title). */
  lessonTitle: z.string().min(1),
  promptsVersion: z.number().int(),
  video: z.object({
    blobUrl: z.url(),
    pathname: z.string().min(1),
    posterUrl: z.url().nullable(),
    vttUrl: z.url().nullable(),
    durationSec: sec,
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    codec: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
  }),
  segments: z.array(z.object({ startSec: sec, endSec: sec, text: z.string() })),
  chapters: z.array(z.object({ title: z.string(), startSec: sec, summary: z.string() })),
  note: z.object({ title: z.string(), blocks: z.array(z.record(z.string(), z.unknown())) }).nullable(),
  cards: z.array(z.object({ front: z.string(), back: z.string(), topic: z.string(), startSec: sec.nullable() })),
  questions: z.array(
    z.object({
      type: z.enum(["mcq", "true_false", "fill_blank"]),
      difficulty: z.enum(["basic", "intermediate", "exam"]),
      bank: z.enum(["practice", "graded"]),
      topic: z.string(),
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string(),
      startSec: sec.nullable(),
    }),
  ),
});

export type LectureFixture = z.infer<typeof lectureFixture>;
