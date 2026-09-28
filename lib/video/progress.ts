import "server-only";

import { z } from "zod";
import { getLessonForUser, type Viewer } from "@/lib/db/courses";
import { recordProgress, type ProgressResult } from "@/lib/db/progress";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { MAX_RANGES } from "./watch";
import { liveVideoDuration } from "./lessons";

/* Saving watch progress (feature 11). One path for the player's periodic
   server action and the pagehide beacon (app/api/progress): parse, check
   the lesson is visible to this student, then save against the video's
   real length from the database — the browser's numbers are clamped. */

const sec = z.number().finite().min(0).max(24 * 3600);

export const progressInputSchema = z.object({
  lessonId: z.uuid(),
  positionSec: sec,
  ranges: z.array(z.tuple([sec, sec])).max(MAX_RANGES * 2),
});
export type ProgressInput = z.input<typeof progressInputSchema>;

export async function saveProgress(viewer: Viewer, input: unknown): Promise<ActionResult<ProgressResult>> {
  const parsed = progressInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "That progress update couldn't be read.");
  const { lessonId, positionSec, ranges } = parsed.data;

  const found = await getLessonForUser(lessonId, viewer);
  if (!found) return fail("not_found", "That lesson isn't available.");
  // Staff watch in preview mode: nothing is recorded.
  if (found.access !== "student") return ok({ completed: false, newlyCompleted: false });

  const videoSec = found.lesson.kind === "video" ? await liveVideoDuration(lessonId) : null;
  const durationSec = videoSec ?? found.lesson.durationSec ?? null;
  return ok(await recordProgress({ userId: viewer.id, lessonId, durationSec, positionSec, ranges }));
}

export type { ProgressResult };
