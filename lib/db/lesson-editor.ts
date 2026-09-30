import "server-only";

import { editorDocumentsQueries, resolveEditorDocuments } from "@/lib/documents";
import { resolveVideoState, videoStateQueries } from "@/lib/video/lessons";
import { assignmentQuery, lessonSubmissionCountsQuery, toSubmissionCounts } from "./assignments";
import { db } from "./client";
import { contentCountsQuery } from "./lesson-content";
import { gradedQuizzesForStaff } from "./quizzes";
import type { Lesson } from "./schema";

/* The lesson editor's reads (feature 29): one batch, run after
   getLessonForUser has confirmed course staff, instead of six or more
   requests in sequence. What follows only touches Trigger.dev for a run
   that has gone quiet (reconcileJob), and writes only to recover a stuck
   video or document (feature 26). */
export async function loadLessonEditor(lesson: Pick<Lesson, "id" | "kind">) {
  const [docRows, docJobs, videoRows, videoJob, segments, [counts], graded, [assignment], submissionRows] = await db.batch([
    ...editorDocumentsQueries(lesson.id),
    ...videoStateQueries(lesson.id),
    contentCountsQuery(lesson.id),
    gradedQuizzesForStaff(lesson.id),
    assignmentQuery(lesson.id),
    lessonSubmissionCountsQuery(lesson.id),
  ]);
  const [documents, video] = await Promise.all([
    resolveEditorDocuments([docRows, docJobs]),
    lesson.kind === "video" ? resolveVideoState([videoRows, videoJob, segments]) : null,
  ]);
  return {
    documents,
    video,
    counts,
    graded,
    assignment: assignment ?? null,
    handedIn: assignment ? toSubmissionCounts(submissionRows) : null,
  };
}
