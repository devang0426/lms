"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/db/notifications";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Mark the bell's notifications read (feature 21). Only the caller's own:
   the update is filtered on the recipient. */

const input = z.object({ id: z.uuid() });

export async function markRead(raw: z.input<typeof input>): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That notification can't be found.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  await markNotificationRead(user.id, parsed.data.id);
  return ok();
}

export async function markAllRead(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  await markAllNotificationsRead(user.id);
  return ok();
}
