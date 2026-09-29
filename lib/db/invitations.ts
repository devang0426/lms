import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { auditLog, courses, courseStaff, enrollments, invitations, sections, type Role, type User } from "./schema";

/* Invitations (feature 22): who was invited to what before they had an
   account. Admin screens call these after their admin check; the sign-in
   sync applies a new user's rows. */

export interface PendingInvitation {
  email: string;
  name: string;
  role: Role;
  invitedAt: Date;
  /* "MATH 201 · Section A" for each course they're waiting on. */
  places: string[];
}

/* Pending invitations, one entry per person, newest first. */
export async function pendingInvitations(limit = 100): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      email: invitations.email,
      name: invitations.name,
      role: invitations.role,
      createdAt: invitations.createdAt,
      courseCode: courses.code,
      sectionName: sections.name,
    })
    .from(invitations)
    .leftJoin(courses, eq(courses.id, invitations.courseId))
    .leftJoin(sections, eq(sections.id, invitations.sectionId))
    .where(isNull(invitations.acceptedAt))
    .orderBy(asc(invitations.email));
  const byEmail = new Map<string, PendingInvitation>();
  for (const r of rows) {
    const p = byEmail.get(r.email) ?? { email: r.email, name: r.name, role: r.role, invitedAt: r.createdAt, places: [] };
    if (r.createdAt > p.invitedAt) p.invitedAt = r.createdAt;
    if (r.courseCode) p.places.push([r.courseCode, r.sectionName].filter(Boolean).join(" · "));
    byEmail.set(r.email, p);
  }
  return [...byEmail.values()].sort((a, b) => b.invitedAt.getTime() - a.invitedAt.getTime()).slice(0, limit);
}

/* Emails that already have a pending invitation to each course (roster preview). */
export async function pendingInvitationKeys(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await db
    .select({ email: invitations.email, courseId: invitations.courseId })
    .from(invitations)
    .where(and(inArray(invitations.email, emails), isNull(invitations.acceptedAt)));
  return new Set(rows.map((r) => `${r.email}|${r.courseId ?? ""}`));
}

export interface InvitationInput {
  email: string;
  name: string;
  role: Role;
  courseId: string | null;
  sectionId: string | null;
  clerkInvitationId: string | null;
  invitedBy: string;
}

/* Invite (or re-invite) someone, for the caller's batch. */
export function saveInvitationsStatement(rows: InvitationInput[]) {
  return db
    .insert(invitations)
    .values(rows)
    .onConflictDoUpdate({
      target: [invitations.email, invitations.courseId],
      set: {
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        sectionId: sql`excluded.section_id`,
        clerkInvitationId: sql`excluded.clerk_invitation_id`,
        invitedBy: sql`excluded.invited_by`,
        createdAt: sql`now()`,
        acceptedAt: null,
      },
    });
}

/* The Clerk invitation ids of someone's pending invitations, and a statement
   deleting those rows (revoking from the Users page). */
export async function pendingForEmail(email: string) {
  const rows = await db
    .select({ id: invitations.id, clerkInvitationId: invitations.clerkInvitationId })
    .from(invitations)
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));
  return {
    clerkIds: [...new Set(rows.flatMap((r) => (r.clerkInvitationId ? [r.clerkInvitationId] : [])))],
    count: rows.length,
    deleteStatement: db.delete(invitations).where(and(eq(invitations.email, email), isNull(invitations.acceptedAt))),
  };
}

/* A new user's first sign-in (syncUserFromClerk): their pending
   invitations become enrollments (as a student) or teaching rows (as an
   instructor or admin), with an audit row each, in one batch. A row whose
   role no longer matches the account stays pending. Returns how many were
   applied. Cheap when there's nothing waiting (one indexed read). */
export async function applyPendingInvitations(user: Pick<User, "id" | "email" | "role">): Promise<number> {
  const email = user.email.trim().toLowerCase();
  if (!email) return 0;
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt)));
  const staff = user.role === "instructor" || user.role === "admin";
  const usable = pending.filter((p) => p.courseId && (p.role === "student" ? user.role === "student" && p.sectionId : staff));
  const ids = pending.filter((p) => !p.courseId || usable.includes(p)).map((p) => p.id);
  if (ids.length === 0) return 0;

  const students = usable.filter((p) => p.role === "student");
  const teachers = usable.filter((p) => p.role !== "student");
  await db.batch([
    db.update(invitations).set({ acceptedAt: sql`now()` }).where(inArray(invitations.id, ids)),
    ...(students.length
      ? [
          db
            .insert(enrollments)
            .values(students.map((p) => ({ sectionId: p.sectionId!, userId: user.id, status: "active" as const })))
            .onConflictDoUpdate({ target: [enrollments.sectionId, enrollments.userId], set: { status: "active" } }),
        ]
      : []),
    ...(teachers.length
      ? [
          db
            .insert(courseStaff)
            .values(teachers.map((p) => ({ courseId: p.courseId!, userId: user.id, role: "instructor" as const })))
            .onConflictDoNothing(),
        ]
      : []),
    db.insert(auditLog).values(
      pending
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          actorId: user.id,
          action: "invitation.accept",
          entityType: p.courseId ? "course" : "user",
          entityId: p.courseId ?? user.id,
          data: { role: p.role, sectionId: p.sectionId, invitedBy: p.invitedBy },
        })),
    ),
  ]);
  return usable.length;
}
