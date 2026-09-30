import type { Block } from "@/lib/ai/types";
import type { ChatCitation } from "@/lib/chat/types";
import type { DocumentKind, SubmissionFile, WatchedRange } from "@/lib/db/schema";
import { blocksToMarkdown } from "@/lib/markdown-blocks";

/* "Download my data" (feature 33): the rows lib/db/data-export.ts reads
   for one person, shaped into the JSON file they download. Pure, so the
   tests pin what goes in. Every row passed in is already the person's own
   (the owner is in each query); this only shapes them.

   Files are linked through the app's access-checked routes, never by
   their Blob URL, so a link works only for the person signed in. Grades
   come only once returned: a draft grade is staff-only (the query leaves
   them out). Imported by the export-user-data task, so it stays light:
   lib/markdown-blocks, never lib/markdown. */

export const EXPORT_FORMAT = "studyhall-data-export";
export const EXPORT_VERSION = 1;

type When = Date | null;

export interface ExportRows {
  profile: { id: string; name: string; email: string; role: string; createdAt: Date };
  enrollments: { courseCode: string; courseTitle: string; section: string; status: string; enrolledAt: Date }[];
  watchProgress: {
    courseCode: string;
    lesson: string;
    positionSec: number;
    watchedRanges: WatchedRange[];
    completedAt: When;
    updatedAt: Date;
  }[];
  lessonNotes: { courseCode: string; lesson: string; atSec: number; text: string; createdAt: Date }[];
  cardReviews: {
    front: string;
    back: string;
    courseCode: string | null;
    lesson: string | null;
    note: string | null;
    state: string;
    due: Date;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    lastReview: When;
  }[];
  quizAttempts: {
    id: string;
    mode: string;
    courseCode: string | null;
    lesson: string | null;
    note: string | null;
    gradedQuiz: string | null;
    startedAt: Date;
    submittedAt: When;
    score: number | null;
  }[];
  quizAnswers: { attemptId: string; question: string; options: string[]; answer: string; correct: boolean }[];
  submissions: {
    id: string;
    courseCode: string;
    assignment: string;
    text: string;
    files: SubmissionFile[];
    submittedAt: Date;
    late: boolean;
    status: string;
  }[];
  grades: {
    courseCode: string | null;
    item: string | null;
    score: number;
    maxScore: number;
    feedback: string;
    gradedAt: Date;
  }[];
  discussions: { courseCode: string; lesson: string | null; title: string; body: string; status: string; createdAt: Date }[];
  replies: { courseCode: string; thread: string; body: string; isAnswer: boolean; createdAt: Date }[];
  privateNotes: { id: string; title: string; blocks: Block[]; createdAt: Date; updatedAt: Date }[];
  privateDocuments: {
    id: string;
    noteId: string | null;
    kind: DocumentKind;
    title: string;
    filename: string | null;
    url: string | null;
    hasFile: boolean;
    createdAt: Date;
  }[];
  chatThreads: {
    id: string;
    title: string;
    courseCode: string | null;
    lesson: string | null;
    note: string | null;
    createdAt: Date;
  }[];
  chatTurns: { threadId: string; role: string; content: string; refused: boolean; citations: ChatCitation[]; createdAt: Date }[];
}

export interface ExportContext {
  /* The site's address (NEXT_PUBLIC_APP_URL). Without it, links are paths. */
  appUrl: string | null;
  now: Date;
}

const iso = (d: When): string | null => (d ? d.toISOString() : null);

export function exportLink(ctx: ExportContext, path: string): string {
  if (!ctx.appUrl) return path;
  try {
    return new URL(path, ctx.appUrl).toString();
  } catch {
    return path;
  }
}

/* The file's name as the person saves it: studyhall-data-2026-09-30.json. */
export function exportFileName(now: Date): string {
  return `studyhall-data-${now.toISOString().slice(0, 10)}.json`;
}

export function buildExportDocument(rows: ExportRows, ctx: ExportContext) {
  const answersByAttempt = groupBy(rows.quizAnswers, (a) => a.attemptId);
  const turnsByThread = groupBy(rows.chatTurns, (t) => t.threadId);
  const sourcesByNote = groupBy(rows.privateDocuments, (d) => d.noteId ?? "");

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: ctx.now.toISOString(),
    site: ctx.appUrl,
    about:
      "Everything Studyhall keeps about you. Links to files open through Studyhall, so sign in first. Times are UTC; positions and timestamps in lessons are seconds.",
    profile: { ...rows.profile, createdAt: rows.profile.createdAt.toISOString() },
    enrollments: rows.enrollments.map((e) => ({ ...e, enrolledAt: e.enrolledAt.toISOString() })),
    watchProgress: rows.watchProgress.map((w) => ({ ...w, completedAt: iso(w.completedAt), updatedAt: w.updatedAt.toISOString() })),
    lessonNotes: rows.lessonNotes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    flashcardReviews: rows.cardReviews.map((r) => ({ ...r, due: r.due.toISOString(), lastReview: iso(r.lastReview) })),
    quizAttempts: rows.quizAttempts.map(({ id, ...a }) => ({
      ...a,
      startedAt: a.startedAt.toISOString(),
      submittedAt: iso(a.submittedAt),
      answers: (answersByAttempt.get(id) ?? []).map(({ attemptId: _attemptId, ...answer }) => answer),
    })),
    submissions: rows.submissions.map(({ id, files, ...s }) => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
      files: files.map((f, index) => ({
        name: f.name,
        contentType: f.contentType,
        size: f.size,
        link: exportLink(ctx, `/submissions/${id}/files/${index}`),
      })),
    })),
    grades: rows.grades.map((g) => ({ ...g, gradedAt: g.gradedAt.toISOString() })),
    discussions: {
      threads: rows.discussions.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      replies: rows.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    },
    privateNotes: rows.privateNotes.map((n) => ({
      title: n.title,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      markdown: blocksToMarkdown(n.blocks),
      sources: (sourcesByNote.get(n.id) ?? []).map((d) => sourceOf(d, ctx)),
    })),
    // A private upload whose note is gone (it shouldn't happen, but the
    // file would still be the person's).
    otherUploads: (sourcesByNote.get("") ?? []).map((d) => sourceOf(d, ctx)),
    assistantChats: rows.chatThreads.map(({ id, ...t }) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      turns: (turnsByThread.get(id) ?? []).map(({ threadId: _threadId, ...turn }) => ({ ...turn, createdAt: turn.createdAt.toISOString() })),
    })),
  };
}

export type ExportDocument = ReturnType<typeof buildExportDocument>;

function sourceOf(d: ExportRows["privateDocuments"][number], ctx: ExportContext) {
  return {
    title: d.title,
    kind: d.kind,
    filename: d.filename,
    createdAt: d.createdAt.toISOString(),
    // A web page or YouTube link is its address; an upload opens through /documents.
    link: d.hasFile ? exportLink(ctx, `/documents/${d.id}`) : d.url,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
