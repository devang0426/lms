"use server";

import { revalidatePath } from "next/cache";
import { requestExport } from "@/lib/account/export";
import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* "Download my data" (feature 33). No input: the export is always the
   signed-in person's own. The daily limit and the insert are one locked
   batch (lib/db/data-export.ts); the file is built by a task. */
export const requestDataExport = safeAction("requestDataExport", async (): Promise<ActionResult<{ exportId: string }>> => {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Sign in again to ask for your data.");
  const res = await requestExport(user);
  if (res.ok) revalidatePath("/profile");
  return res;
});
