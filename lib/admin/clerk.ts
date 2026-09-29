import "server-only";

import type { User as ClerkUser } from "@clerk/backend";
import { clerkBackend as clerk } from "@/lib/auth/clerk";
import type { Role } from "@/lib/db/schema";

/* Clerk calls for the admin screens (feature 22): find accounts by email,
   send invitations, and set a role. Clerk owns identity and the role;
   callers mirror changes into Neon. Server-only (the secret key). */

export function primaryEmail(u: ClerkUser): string {
  return (u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0])?.emailAddress.toLowerCase() ?? "";
}

/* Clerk accounts for these emails (lowercase), 100 per request. Only exact
   matches count. */
export async function clerkUsersByEmail(emails: string[]): Promise<Map<string, ClerkUser>> {
  const found = new Map<string, ClerkUser>();
  const wanted = new Set(emails);
  for (let i = 0; i < emails.length; i += 100) {
    const { data } = await clerk().users.getUserList({ emailAddress: emails.slice(i, i + 100), limit: 100 });
    for (const u of data) {
      for (const e of u.emailAddresses) {
        const addr = e.emailAddress.toLowerCase();
        if (wanted.has(addr)) found.set(addr, u);
      }
    }
  }
  return found;
}

export type InviteOutcome = { ok: true; invitationId: string } | { ok: false; error: string };

/* Send Clerk invitations (the email carries a sign-up link; the role goes
   in public metadata and becomes the user's on sign-up). Ten per request;
   when a batch is refused, each address is tried alone so one bad address
   doesn't sink the rest. */
export async function sendInvitations(people: { email: string; role: Role }[], redirectUrl: string): Promise<Map<string, InviteOutcome>> {
  const out = new Map<string, InviteOutcome>();
  const params = (p: { email: string; role: Role }) => ({
    emailAddress: p.email,
    publicMetadata: { role: p.role },
    redirectUrl,
    notify: true,
    ignoreExisting: true,
  });
  for (let i = 0; i < people.length; i += 10) {
    const chunk = people.slice(i, i + 10);
    try {
      const made = await clerk().invitations.createInvitationBulk(chunk.map(params));
      for (const inv of made) out.set(inv.emailAddress.toLowerCase(), { ok: true, invitationId: inv.id });
    } catch {
      for (const p of chunk) {
        try {
          const inv = await clerk().invitations.createInvitation(params(p));
          out.set(p.email, { ok: true, invitationId: inv.id });
        } catch (err) {
          out.set(p.email, { ok: false, error: clerkMessage(err, "Clerk couldn't send an invitation to this address.") });
        }
      }
    }
  }
  return out;
}

export async function revokeInvitations(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await clerk().invitations.revokeInvitation(id);
    } catch {
      // Already accepted, revoked or expired: nothing left to stop.
    }
  }
}

/* Set the role in Clerk (the source of truth). The session token picks it
   up on its next refresh, within about a minute. */
export async function setClerkRole(clerkId: string, role: Role): Promise<void> {
  await clerk().users.updateUserMetadata(clerkId, { publicMetadata: { role } });
}

/* Clerk's own reason, when it gives one (e.g. "is not a valid email address"). */
export function clerkMessage(err: unknown, fallback: string): string {
  const errors = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  const first = errors?.[0];
  return first?.longMessage ?? first?.message ?? fallback;
}
