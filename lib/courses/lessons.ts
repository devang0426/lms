import type { LessonKind, LessonStatus } from "@/lib/db/schema";

/* Course-builder rules for lessons (feature 27). Pure: the builder's
   buttons use them to explain themselves, and the server actions enforce
   them. */

export const LESSON_KIND_LABELS: Record<LessonKind, string> = {
  video: "Video",
  reading: "Reading",
  quiz: "Quiz",
  assignment: "Assignment",
};

/* What a teacher can add, or change a lesson to. "Quiz" is gone (V5): its
   editor only had a documents card, and graded quizzes live in each
   lesson's Quiz tab. Existing quiz lessons keep working. */
export const ADDABLE_LESSON_KINDS = ["video", "reading", "assignment"] as const satisfies readonly LessonKind[];
export type AddableLessonKind = (typeof ADDABLE_LESSON_KINDS)[number];

/* What the builder knows about each lesson besides its row
   (lib/db/course-builder.ts → lessonBuilderFacts). */
export interface LessonFacts {
  readyVideo: boolean;
  /* No video, documents, assignment or AI content: its type can change. */
  empty: boolean;
  /* Drafts that go live when the lesson is published. */
  drafts: { notes: number; cards: number; questions: number };
}

export const VIDEO_FIRST = "Upload and process the video first.";

/* Why this lesson can't be published yet, or null. A video lesson goes
   live only with a ready video (V4): students would open an empty player. */
export function publishRefusal(lesson: { kind: LessonKind; status: LessonStatus }, hasReadyVideo: boolean): string | null {
  if (lesson.status === "processing") return "This lesson is still processing. Publish it once it's ready.";
  if (lesson.kind === "video" && !hasReadyVideo) return VIDEO_FIRST;
  return null;
}

export const TYPE_CHANGE_REFUSAL =
  "Only an empty lesson can change type. This one already has a video, documents, an assignment or AI drafts.";

/* Drafts that go live with the lesson, for the Publish confirm step:
   ["the lesson", "its notes", "24 flashcards", "1 quiz question"]. */
export function goesLive(drafts: { notes: number; cards: number; questions: number }): string[] {
  const items = ["the lesson"];
  if (drafts.notes > 0) items.push("its notes");
  if (drafts.cards > 0) items.push(`${drafts.cards} ${drafts.cards === 1 ? "flashcard" : "flashcards"}`);
  if (drafts.questions > 0) items.push(`${drafts.questions} quiz ${drafts.questions === 1 ? "question" : "questions"}`);
  return items;
}
