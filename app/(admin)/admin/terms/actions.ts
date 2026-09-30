"use server";

import { eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { isUuid } from "@/lib/db/courses";
import { terms } from "@/lib/db/schema";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/* Academic terms (feature 22), admin only. One term is current: the
   catalog shows its courses and the roster import matches its codes. */

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

const day = z.iso.date({ message: "Pick a date." });
const termInput = z
  .object({
    name: z.string().trim().min(2, "Name the term, e.g. Spring 2027.").max(60, "Keep the name under 60 characters."),
    startsOn: day,
    endsOn: day,
    makeCurrent: z.boolean(),
  })
  .refine((t) => t.endsOn > t.startsOn, { message: "The term has to end after it starts.", path: ["endsOn"] });

export const createTerm = safeAction("createTerm", async (raw: z.input<typeof termInput>): Promise<ActionResult<{ id: string }>> => {
  const parsed = termInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the term.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can add terms.");
  const { name, startsOn, endsOn, makeCurrent } = parsed.data;

  const id = crypto.randomUUID();
  await db.batch([
    db.insert(terms).values({ id, name, startsOn, endsOn, isCurrent: makeCurrent }),
    auditInsert({ actorId: admin.id, action: "term.create", entityType: "term", entityId: id, data: { name, startsOn, endsOn, current: makeCurrent } }),
    ...(makeCurrent ? [db.update(terms).set({ isCurrent: false }).where(ne(terms.id, id))] : []),
  ]);
  revalidatePath("/admin/terms");
  return ok({ id });
});

const currentInput = z.object({ id: z.uuid() });

export const makeCurrentTerm = safeAction("makeCurrentTerm", async (raw: z.input<typeof currentInput>): Promise<ActionResult> => {
  const parsed = currentInput.safeParse(raw);
  if (!parsed.success || !isUuid(parsed.data.id)) return fail("invalid", "That term can't be found.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can change the current term.");
  const { id } = parsed.data;
  const [term] = await db.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.id, id)).limit(1);
  if (!term) return fail("not_found", "That term can't be found.");

  await db.batch([
    db.update(terms).set({ isCurrent: false }).where(ne(terms.id, id)),
    db.update(terms).set({ isCurrent: true }).where(eq(terms.id, id)),
    auditInsert({ actorId: admin.id, action: "term.make_current", entityType: "term", entityId: id, data: { name: term.name } }),
  ]);
  revalidatePath("/admin/terms");
  revalidatePath("/catalog");
  return ok();
});
