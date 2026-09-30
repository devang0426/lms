"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { requestLessonPodcast } from "@/lib/podcast";
import { fail, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* The Podcast tab's Generate button (feature 17). zod → session → lesson
   visible to this user → claim and queue the task. Who may start one
   (staff, or the first student to ask) is decided in lib/podcast. */

const input = z.object({
  lessonId: z.uuid(),
  length: z.enum(["short", "medium", "long"]).default("short"),
  language: z.enum(["en", "hinglish"]).default("en"),
});

export const generatePodcast = safeAction("generatePodcast", async (raw: z.input<typeof input>): Promise<ActionResult> => {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That lesson couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const found = await getLessonForUser(parsed.data.lessonId, user);
  if (!found) return fail("not_found", "That lesson isn't available.");

  const result = await requestLessonPodcast(user, parsed.data.lessonId, found.access, parsed.data.length, parsed.data.language);
  // Also on a conflict: someone else's run or episode is now worth showing.
  refresh();
  return result;
});
