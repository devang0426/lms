import "server-only";

import { sql } from "drizzle-orm";
import type { Block } from "@/lib/ai/types";
import { podcastTabsFrom } from "@/lib/podcast";
import { liveSegmentsQuery, liveVideoQuery, toLiveVideo, type LiveVideo } from "@/lib/video/lessons";
import { studentWorkQuery, toStudentWork, type StudentWork } from "./assignments";
import { latestThreadQueries, toLatestThread } from "./chat";
import { db } from "./client";
import { courseForUserQueries, toCourseForUser, type LessonForUser, type ModuleWithLessons, type Viewer } from "./courses";
import { lessonDiscussionCountQuery, listDiscussionsQuery, toDiscussionSummaries } from "./discussions";
import { lessonDocumentsQuery, toDocumentSummaries, type DocumentSummary } from "./documents";
import { chaptersQuery, playerNoteQuery, toPlayerNote } from "./lesson-content";
import { lessonPodcastQueries, toLessonPodcasts } from "./podcasts";
import { completedLessonsQuery, lessonNotesQuery, watchProgressQuery } from "./progress";
import { quizTabQueries, toQuizTabData } from "./quizzes";
import type { ChatTurn, LessonNote, WatchProgress } from "./schema";
import { lessonDeckQueries, toStudyQueue } from "./study";

/* The lesson player's reads (feature 29), in two batches after
   getLessonForUser has let the viewer in, instead of ~22 requests in four
   waves:
   - loadLessonPlayer: what the page renders first (the video, the study
     notes, the contents, the Ask thread), plus the counts and flags the
     tab row needs.
   - loadPlayerPanels: the bodies of the tabs that start closed
     (Transcript, Flashcards, Quiz, Podcast, Discussion), which stream in
     behind Suspense. On a slow link the response size matters as much as
     the round trip, so the transcript and the rendered cards wait here.
   Chat turns and transcript lines are read through subqueries, so nothing
   waits for another read. */

export const DISCUSSION_LIMIT = 30;
const DECK_LIMIT = 100;

export interface PlayerData {
  modules: ModuleWithLessons[];
  video: LiveVideo | null;
  progress: WatchProgress | null;
  notes: LessonNote[];
  completed: Set<string>;
  chapters: { title: string; startSec: number }[];
  studyNotes: Block[] | null;
  thread: { id: string; turns: ChatTurn[] } | null;
  /* The Flashcards tab: all live cards, and those due now. */
  deckCount: { total: number; due: number };
  documents: DocumentSummary[];
  work: StudentWork | null;
  hasQuiz: boolean;
  showPodcast: boolean;
  discussionCount: number;
}

/* Practice questions or a graded quiz, and a finished podcast, for the
   tab row. Students count published practice questions only. */
function tabFlags(lessonId: string, publishedOnly: boolean) {
  return db.execute<{ has_quiz: boolean; has_audio: boolean }>(sql`select
    (exists (select 1 from graded_quizzes g where g.lesson_id = ${lessonId})
      or exists (select 1 from quiz_questions q where q.lesson_id = ${lessonId} and q.bank = 'practice'
        and (q.status = 'published' or ${!publishedOnly}))) as has_quiz,
    exists (select 1 from podcasts p where p.lesson_id = ${lessonId} and p.length = 'short' and p.audio_url is not null) as has_audio`);
}

export async function loadLessonPlayer(found: LessonForUser, viewer: Viewer): Promise<PlayerData> {
  const { lesson, course } = found;
  const preview = found.access === "staff";
  const [, deckTotals] = lessonDeckQueries(viewer.id, lesson.id, preview, DECK_LIMIT);
  const [
    access,
    mods,
    lessonRows,
    video,
    progress,
    notes,
    completed,
    chapters,
    note,
    thread,
    turns,
    [deck],
    documents,
    work,
    flags,
    [discussions],
  ] = await db.batch([
    ...courseForUserQueries(course.id, viewer),
    liveVideoQuery(lesson.id),
    watchProgressQuery(viewer.id, lesson.id),
    lessonNotesQuery(viewer.id, lesson.id),
    completedLessonsQuery(viewer.id, course.id),
    chaptersQuery(lesson.id),
    // Students get the notes only once the instructor has published them.
    playerNoteQuery(lesson.id, { publishedOnly: !preview }),
    // The assistant reopens the newest conversation about this lesson.
    ...latestThreadQueries({ userId: viewer.id, courseId: course.id, lessonId: lesson.id }),
    // Flashcards: how many (the cards themselves come with the panels).
    deckTotals,
    // Documents: students see ready ones; staff also see what's still being read.
    lessonDocumentsQuery(lesson.id, { readyOnly: !preview }),
    // Assignment: the student's own work and returned grade; staff see the instructions.
    studentWorkQuery(viewer.id, lesson.id),
    tabFlags(lesson.id, !preview),
    lessonDiscussionCountQuery(viewer, lesson.id, DISCUSSION_LIMIT),
  ]);

  const studyNotes = toPlayerNote(note);
  const { has_quiz: hasQuiz, has_audio: hasAudio } = flags.rows[0] ?? { has_quiz: false, has_audio: false };
  return {
    modules: toCourseForUser([access, mods, lessonRows])?.modules ?? [],
    video: lesson.kind === "video" ? toLiveVideo(video) : null,
    progress: preview ? null : (progress[0] ?? null),
    notes,
    completed: new Set(preview ? [] : completed.map((r) => r.lessonId)),
    chapters,
    studyNotes,
    thread: toLatestThread([thread, turns]),
    deckCount: { total: deck?.n ?? 0, due: Math.min(deck?.due ?? 0, DECK_LIMIT) },
    documents: toDocumentSummaries(documents),
    work: lesson.kind === "assignment" ? toStudentWork(work) : null,
    hasQuiz: Boolean(hasQuiz),
    // Podcasts are made from the published notes, only when someone asks.
    showPodcast: preview || studyNotes !== null || Boolean(hasAudio),
    discussionCount: discussions?.n ?? 0,
  };
}

/* The closed tabs' bodies, in one batch that the page starts once
   loadLessonPlayer is back: sent beside it, it would open a second
   connection to Neon (~1.2 s from India) and slow the first batch down. */
export async function loadPlayerPanels(found: LessonForUser, viewer: Viewer) {
  const lessonId = found.lesson.id;
  const preview = found.access === "staff";
  const [segments, cards, cardTotals, levels, graded, questions, answers, note, podcastRows, threads] = await db.batch([
    liveSegmentsQuery(lessonId),
    // Flashcards: the student's due cards; staff preview the whole deck unsaved.
    ...lessonDeckQueries(viewer.id, lessonId, preview, DECK_LIMIT),
    ...quizTabQueries(viewer.id, lessonId, preview),
    ...lessonPodcastQueries(lessonId, "short"),
    listDiscussionsQuery(viewer, { lessonId, limit: DISCUSSION_LIMIT }),
  ]);
  return {
    segments: found.lesson.kind === "video" ? segments : [],
    deck: toStudyQueue([cards, cardTotals]),
    quiz: toQuizTabData([levels, graded, questions, answers], preview),
    // Podcast: made from the published notes, only when someone asks.
    podcast: await podcastTabsFrom(toLessonPodcasts([note, podcastRows]), found.access),
    // Discussion: the class's questions about this lesson (feature 21).
    threads: toDiscussionSummaries(threads),
  };
}
