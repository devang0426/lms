"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signUpUrl } from "@/lib/admin/links";
import { getCurrentUser } from "@/lib/auth";
import { ROSTER_LIMITS } from "@/lib/roster";
import { applyRoster, planRoster, type RosterPlan } from "@/lib/roster/import";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* CSV roster import (feature 22), admin only. The browser reads the file
   and sends its text (a small form field, like pasted text; no file is
   stored). Preview writes nothing; import plans again and applies the
   good rows. */

const input = z.object({ csv: z.string().max(ROSTER_LIMITS.bytes, "That file is over 200 KB. Split it into smaller files.") });

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function previewRoster(raw: z.input<typeof input>): Promise<ActionResult<RosterPlan>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That file can't be read.");
  if (!(await requireAdmin())) return fail("unauthorized", "Only admins can import rosters.");
  const res = await planRoster(parsed.data.csv);
  return res.ok ? ok(res.plan) : fail("invalid", res.error);
}

export async function importRoster(raw: z.input<typeof input>): Promise<ActionResult<RosterPlan>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That file can't be read.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can import rosters.");
  const res = await applyRoster(parsed.data.csv, admin, await signUpUrl());
  if (!res.ok) return fail("invalid", res.error);
  revalidatePath("/admin/users");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/audit");
  return ok(res.plan);
}
