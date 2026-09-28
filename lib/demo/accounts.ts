import "server-only";

import type { ClerkClient, User as ClerkUser } from "@clerk/backend";
import type { Role } from "@/lib/db/schema";

/* Demo accounts (feature 03). Only usable when DEMO_MODE=true — never in a
   real rollout. `+clerk_test` addresses skip email verification on Clerk
   development instances. */

export type DemoAccountKey = "admin" | "student";

export interface DemoAccount {
  key: DemoAccountKey;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  label: string;
  shows: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "admin",
    firstName: "Meera",
    lastName: "Rao",
    email: "demo.admin+clerk_test@example.com",
    role: "admin",
    label: "Admin · Instructor",
    shows: "Upload lectures, review AI drafts, grade, manage the university",
  },
  {
    key: "student",
    firstName: "Aanya",
    lastName: "Sharma",
    email: "demo.student+clerk_test@example.com",
    role: "student",
    label: "Student",
    shows: "Watch lectures, ask the assistant, study, hand in work",
  },
] as const;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function demoPassword(): string {
  const pw = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!pw) throw new Error("DEMO_ACCOUNT_PASSWORD is not set.");
  return pw;
}

export function getDemoAccount(key: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.key === key);
}

/* Find the Clerk user for a demo account, creating it if missing. Keeps the
   role in publicMetadata correct. With `resetPassword`, also re-applies
   DEMO_ACCOUNT_PASSWORD (used by the seed so the shown password always
   works). Idempotent. */
export async function ensureDemoClerkUser(
  clerk: ClerkClient,
  account: DemoAccount,
  opts: { resetPassword?: boolean } = {},
): Promise<ClerkUser> {
  const password = demoPassword();
  const { data } = await clerk.users.getUserList({ emailAddress: [account.email], limit: 1 });
  const existing = data[0];

  if (!existing) {
    return clerk.users.createUser({
      emailAddress: [account.email],
      password,
      firstName: account.firstName,
      lastName: account.lastName,
      publicMetadata: { role: account.role },
      skipPasswordChecks: true,
      skipLegalChecks: true,
    });
  }

  let user = existing;
  if (existing.publicMetadata?.role !== account.role) {
    user = await clerk.users.updateUserMetadata(existing.id, {
      publicMetadata: { role: account.role },
    });
  }
  if (opts.resetPassword) {
    user = await clerk.users.updateUser(existing.id, { password, skipPasswordChecks: true });
  }
  return user;
}
