"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clerkMessage, clerkUsersByEmail, revokeInvitations, sendInvitations, setClerkRole } from "@/lib/admin/clerk";
import { signUpUrl } from "@/lib/admin/links";
import { getCurrentUser, syncUserFromClerk } from "@/lib/auth";
import { auditInsert } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { pendingForEmail, saveInvitationsStatement } from "@/lib/db/invitations";
import { courseStaff, enrollments, ROLES } from "@/lib/db/schema";
import { getUser, setRoleStatement, usersByEmail } from "@/lib/db/users";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* People (feature 22), admin only. zod → admin → Clerk (the source of
   truth for identity and the role) → the Neon mirror and the audit row in
   one batch. */

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

const roleInput = z.object({ userId: z.uuid(), role: z.enum(ROLES) });

/* Change someone's role. Access follows the role: a student made staff
   leaves their enrollments (dropped, kept for audit); someone made a
   student stops teaching (their course_staff rows go), since course
   staff rows grant staff access whatever the role. */
export async function changeRole(raw: z.input<typeof roleInput>): Promise<ActionResult<{ coursesLeft: number }>> {
  const parsed = roleInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", "Pick a role.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can change roles.");
  const { userId, role } = parsed.data;
  if (userId === admin.id) return fail("invalid", "You can't change your own role. Ask another admin.");
  const target = await getUser(userId);
  if (!target) return fail("not_found", "That person doesn't exist.");
  if (target.role === role) return ok({ coursesLeft: 0 });

  try {
    await setClerkRole(target.clerkId, role);
  } catch (err) {
    return fail("conflict", clerkMessage(err, "Clerk didn't accept the change. Try again in a moment."));
  }

  const [taught, enrolled] = await db.batch([
    db.select({ courseId: courseStaff.courseId }).from(courseStaff).where(eq(courseStaff.userId, userId)),
    db.select({ sectionId: enrollments.sectionId }).from(enrollments).where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active"))),
  ]);
  const stopTeaching = role === "student" && taught.length > 0;
  const leaveCourses = target.role === "student" && enrolled.length > 0;
  await db.batch([
    setRoleStatement(userId, role),
    auditInsert({
      actorId: admin.id,
      action: "user.role_change",
      entityType: "user",
      entityId: userId,
      data: {
        from: target.role,
        to: role,
        ...(stopTeaching ? { removedFromStaff: taught.map((t) => t.courseId) } : {}),
        ...(leaveCourses ? { droppedSections: enrolled.map((e) => e.sectionId) } : {}),
      },
    }),
    ...(stopTeaching ? [db.delete(courseStaff).where(eq(courseStaff.userId, userId))] : []),
    ...(leaveCourses
      ? [
          db
            .update(enrollments)
            .set({ status: "dropped" })
            .where(and(eq(enrollments.userId, userId), inArray(enrollments.sectionId, enrolled.map((e) => e.sectionId)))),
        ]
      : []),
  ]);
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
  return ok({ coursesLeft: stopTeaching ? taught.length : leaveCourses ? enrolled.length : 0 });
}

const inviteInput = z.object({
  email: z.email("Enter an email address.").transform((e) => e.trim().toLowerCase()),
  name: z.string().trim().min(1, "Add their name.").max(120, "Keep the name under 120 characters."),
  role: z.enum(ROLES),
});

/* Invite someone by email (a Clerk invitation). Someone who already has a
   Clerk account but hasn't opened Studyhall is linked instead. */
export async function inviteUser(raw: z.input<typeof inviteInput>): Promise<ActionResult<{ outcome: "invited" | "linked" }>> {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Check the invitation.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can invite people.");
  const { email, name, role } = parsed.data;

  if ((await usersByEmail([email])).has(email)) return fail("conflict", `${email} already has an account. Change their role in the list below.`);
  const existing = (await clerkUsersByEmail([email])).get(email);
  if (existing) {
    const linked = await syncUserFromClerk(existing);
    await db.batch([auditInsert({ actorId: admin.id, action: "user.link", entityType: "user", entityId: linked.id, data: { email } })]);
    revalidatePath("/admin/users");
    return ok({ outcome: "linked" });
  }

  const sent = (await sendInvitations([{ email, role }], await signUpUrl())).get(email);
  if (!sent?.ok) return fail("conflict", sent?.error ?? "Clerk didn't send the invitation. Try again in a moment.");
  await db.batch([
    saveInvitationsStatement([{ email, name, role, courseId: null, sectionId: null, clerkInvitationId: sent.invitationId, invitedBy: admin.id }]),
    auditInsert({ actorId: admin.id, action: "invitation.send", entityType: "user", entityId: email, data: { role } }),
  ]);
  revalidatePath("/admin/users");
  return ok({ outcome: "invited" });
}

const revokeInput = z.object({ email: z.email().transform((e) => e.toLowerCase()) });

/* Withdraw someone's pending invitations (Clerk's and ours). */
export async function revokeInvitation(raw: z.input<typeof revokeInput>): Promise<ActionResult> {
  const parsed = revokeInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", "That invitation can't be found.");
  const admin = await requireAdmin();
  if (!admin) return fail("unauthorized", "Only admins can withdraw invitations.");
  const { email } = parsed.data;

  const pending = await pendingForEmail(email);
  if (pending.count === 0) return fail("not_found", "There's no pending invitation for that address.");
  await revokeInvitations(pending.clerkIds);
  await db.batch([
    pending.deleteStatement,
    auditInsert({ actorId: admin.id, action: "invitation.revoke", entityType: "user", entityId: email, data: { invitations: pending.count } }),
  ]);
  revalidatePath("/admin/users");
  return ok();
}
