import "server-only";

import { eq } from "drizzle-orm";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { hasReadyDocuments } from "@/lib/db/documents";
import { publishLessonStatements } from "@/lib/db/lesson-content";
import { lessons } from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { lessonHasReadyVideo, startLessonIndexing } from "@/lib/video/lessons";
import { publishRefusal } from "./lessons";

/* The one Publish (feature 27, N2). The curriculum row and the review
   screen both come here, so a lesson and its drafted notes, flashcards and
   quiz always go live together, and a video lesson only with a ready
   video (V4). Then the assistant indexes its transcript and documents.
   Callers check course staff. */
export async function publishLessonWithContent(lessonId: string, actorId: string, via: "builder" | "review"): Promise<ActionResult> {
  const [[lesson], hasVideo, hasDocuments] = await Promise.all([
    db.select({ kind: lessons.kind, status: lessons.status }).from(lessons).where(eq(lessons.id, lessonId)),
    lessonHasReadyVideo(lessonId),
    hasReadyDocuments(lessonId),
  ]);
  if (!lesson) return fail("not_found", "That lesson no longer exists. Reload the page.");
  const refusal = publishRefusal(lesson, hasVideo);
  if (refusal) return fail("conflict", refusal);

  await db.batch([
    ...publishLessonStatements(lessonId),
    auditInsert({ actorId, action: "lesson.published_with_content", entityType: "lesson", entityId: lessonId, data: { via } }),
  ]);
  if (hasVideo || hasDocuments) await startLessonIndexing(lessonId, actorId);
  return ok();
}
