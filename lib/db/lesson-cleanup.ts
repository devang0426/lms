import "server-only";

import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "./client";
import { documents, jobs, lessons, modules, podcasts, videos, type Job } from "./schema";

/* What deleting lessons leaves outside their rows (feature 26): Blob files
   (videos, posters, captions, documents, podcasts) and background runs
   still working on them. The rows cascade away with the lesson, so this
   is read first; the caller then cancels the runs, deletes the rows and
   deletes the files, in that order, as deleteNote does. deleteBlobs skips
   the seeded demo lecture's shared files. Callers check course staff. */

/* One lesson, a module's lessons, or a whole course's (feature 35). */
export type LessonScope = { lessonId: string } | { moduleId: string } | { courseId: string };

export interface LessonLeftovers {
  blobUrls: string[];
  /* Unfinished jobs for the lessons, their videos, documents and podcasts. */
  jobs: Job[];
}

export async function lessonLeftovers(scope: LessonScope): Promise<LessonLeftovers> {
  // One round trip: a module's or course's lessons are a subquery in each read.
  const inScope = (column: AnyPgColumn): SQL =>
    "lessonId" in scope
      ? eq(column, scope.lessonId)
      : "moduleId" in scope
        ? inArray(column, db.select({ id: lessons.id }).from(lessons).where(eq(lessons.moduleId, scope.moduleId)))
        : inArray(
            column,
            db
              .select({ id: lessons.id })
              .from(lessons)
              .innerJoin(modules, eq(modules.id, lessons.moduleId))
              .where(eq(modules.courseId, scope.courseId)),
          );
  const [lessonRows, videoRows, documentRows, podcastRows] = await db.batch([
    db.select({ id: lessons.id }).from(lessons).where(inScope(lessons.id)),
    db
      .select({ id: videos.id, blobUrl: videos.blobUrl, posterUrl: videos.posterUrl, vttUrl: videos.vttUrl })
      .from(videos)
      .where(inScope(videos.lessonId)),
    db.select({ id: documents.id, blobUrl: documents.blobUrl }).from(documents).where(inScope(documents.lessonId)),
    db.select({ id: podcasts.id, audioUrl: podcasts.audioUrl }).from(podcasts).where(inScope(podcasts.lessonId)),
  ]);

  const blobUrls = [
    ...videoRows.flatMap((v) => [v.blobUrl, v.posterUrl, v.vttUrl]),
    ...documentRows.map((d) => d.blobUrl),
    ...podcastRows.map((p) => p.audioUrl),
  ].filter((u): u is string => Boolean(u));

  const entities: [string, string[]][] = [
    ["lesson", lessonRows.map((r) => r.id)],
    ["video", videoRows.map((r) => r.id)],
    ["document", documentRows.map((r) => r.id)],
    ["podcast", podcastRows.map((r) => r.id)],
  ];
  const owned = entities.filter(([, ids]) => ids.length > 0).map(([type, ids]) => and(eq(jobs.entityType, type), inArray(jobs.entityId, ids)));
  const unfinished =
    owned.length > 0
      ? await db
          .select()
          .from(jobs)
          .where(and(inArray(jobs.status, ["queued", "running"]), or(...owned)))
      : [];
  return { blobUrls, jobs: unfinished };
}
