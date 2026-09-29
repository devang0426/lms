import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { getCourseAccess } from "@/lib/db/courses";
import { users, type Role, type User } from "@/lib/db/schema";
import { isRole, syncUserFromClerk } from "./sync";

/* Authorization lives here and in lib/db — never only in proxy.ts or the UI.
   Clerk owns identity and the role (publicMetadata.role); the Neon `users`
   row is the copy the data layer joins against. The Clerk → Neon sync is
   in ./sync (re-exported here). */

export { syncUserFromClerk };

const RESYNC_AFTER_MS = 10 * 60 * 1000;

/* The signed-in user's Neon row, or null when signed out. Memoized per
   request. Role changes made in Clerk are picked up from the session claims
   when the session token is customized (see feature 02), otherwise by a
   periodic re-sync from the Clerk API. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const [row] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  const claimRole = sessionClaims?.metadata?.role;

  if (row && !row.deletedAt) {
    if (isRole(claimRole)) {
      if (claimRole === row.role) return row;
      const [updated] = await db
        .update(users)
        .set({ role: claimRole })
        .where(eq(users.id, row.id))
        .returning();
      return updated;
    }
    if (Date.now() - row.updatedAt.getTime() < RESYNC_AFTER_MS) return row;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  return syncUserFromClerk(clerkUser);
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/no-access");
  return user;
}

/* Where each role starts. Admin is also the demo instructor, so staff land
   on the teaching dashboard. */
export function homePathFor(role: Role): "/" | "/instructor" {
  return role === "student" ? "/" : "/instructor";
}

/* Area guard for the app-shell layouts: a role mismatch sends the user to
   their own home rather than an error page (a student opening /instructor
   lands on /). Pages and queries still do their own checks. */
export async function requireAreaRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

/* Course-scoped checks for pages. Anything the user may not see is a 404,
   so a URL never reveals that a draft or someone else's course exists.
   Server actions use getCourseAccess() and return an error instead. */
export async function requireCourseStaff(courseId: string): Promise<User> {
  const user = await requireUser();
  if ((await getCourseAccess(courseId, user)) !== "staff") notFound();
  return user;
}

/* Enrolled students of a published course pass; so do its staff. */
export async function requireEnrollment(courseId: string): Promise<User> {
  const user = await requireUser();
  if (!(await getCourseAccess(courseId, user))) notFound();
  return user;
}
