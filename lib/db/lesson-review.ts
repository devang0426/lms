import "server-only";

import { latestJobPerKindQuery, reconcileJob } from "@/lib/jobs";
import { db } from "./client";
import { contentCountsQuery, draftSourceModeQuery, lessonContentQueries, toLessonContent, type ContentKind } from "./lesson-content";
import type { Job } from "./schema";

/* The review page's reads (feature 29): one batch after getLessonForUser
   has confirmed course staff. The four generate-* jobs are one DISTINCT ON
   (kind) statement, and the source is a "has one" check rather than the
   whole transcript, which the page never showed. */

const KINDS: ContentKind[] = ["chapters", "notes", "cards", "quiz"];

export async function loadLessonReview(lessonId: string) {
  const [source, chapters, note, cards, questions, [counts], jobRows] = await db.batch([
    draftSourceModeQuery(lessonId),
    ...lessonContentQueries(lessonId, { publishedOnly: false }),
    contentCountsQuery(lessonId),
    latestJobPerKindQuery({ type: "lesson", id: lessonId }, KINDS.map((k) => `generate-${k}` as const)),
  ]);
  const reconciled = await Promise.all(jobRows.map((job) => reconcileJob(job)));
  const byKind = new Map(reconciled.map((job) => [job.kind, job]));
  const mode = source.rows[0]?.mode ?? null;
  return {
    source: mode ? { mode } : null,
    content: toLessonContent([chapters, note, cards, questions]),
    counts,
    jobs: Object.fromEntries(KINDS.map((k) => [k, byKind.get(`generate-${k}`) ?? null])) as Record<ContentKind, Job | null>,
  };
}
