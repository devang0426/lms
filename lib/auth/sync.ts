import "server-only";

import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { applyPendingInvitations } from "@/lib/db/invitations";
import { ROLES, users, type Role, type User } from "@/lib/db/schema";
import { clerkBackend } from "./clerk";

/* The Clerk → Neon user sync (feature 02), in its own module so the
   webhook, the lazy sync in getCurrentUser and the admin screens (feature
   22) share it without pulling in Next.js page helpers. */

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type ClerkUserLike = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
  publicMetadata: Record<string, unknown>;
};

/* Upsert the Neon mirror of a Clerk user. Used by the webhook and by the
   lazy sync (the webhook can't reach localhost in dev). A user with no
   role in Clerk gets "student", written back to Clerk so claims agree.
   It never clears `deletedAt` (feature 24, S11): webhooks can arrive out
   of order, and a late user.updated must not bring a deleted user back.
   Nor does it touch a deleted row at all (feature 33): the erase has
   anonymised it, and the name and email must not come back either. A
   deleted user's pending invitations aren't applied. */
export async function syncUserFromClerk(u: ClerkUserLike): Promise<User> {
  const email =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
    u.emailAddresses[0]?.emailAddress ??
    "";
  const name =
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
    u.username ||
    email.split("@")[0] ||
    "User";
  const clerkRole = u.publicMetadata?.role;
  const role: Role = isRole(clerkRole) ? clerkRole : "student";

  if (!isRole(clerkRole)) {
    await clerkBackend().users.updateUserMetadata(u.id, { publicMetadata: { role } });
  }

  const [upserted] = await db
    .insert(users)
    .values({ clerkId: u.id, email, name, imageUrl: u.imageUrl, role })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email, name, imageUrl: u.imageUrl, role, updatedAt: new Date() },
      setWhere: isNull(users.deletedAt),
    })
    .returning();
  // No row back = the existing row is deleted, and was left as it is.
  const row = upserted ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];
  if (row.deletedAt) return row;
  // Feature 22: someone invited (Users page or roster import) gets the
  // courses they were invited to. A failure here must not block sign-in;
  // the next sync tries again.
  try {
    await applyPendingInvitations(row);
  } catch (err) {
    console.error("Applying pending invitations failed", err);
  }
  return row;
}
