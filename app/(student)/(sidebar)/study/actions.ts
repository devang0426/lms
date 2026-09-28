"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { recordReview } from "@/lib/db/study";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Rate a flashcard (feature 15). Used by the deck at /study and in the
   lesson player. The schedule is computed on the server from the stored
   state (lib/study/fsrs.ts); the browser only sends the rating. A card
   the student can't see is "not found". */

const input = z.object({
  cardId: z.uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

export async function rateCard(raw: z.input<typeof input>): Promise<ActionResult<{ due: number }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That rating couldn't be saved.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  const outcome = await recordReview(user.id, parsed.data.cardId, parsed.data.rating);
  if (!outcome) return fail("not_found", "That card is no longer available.");
  return ok({ due: outcome.due });
}
