"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { ensureDemoClerkUser, getDemoAccount, isDemoMode } from "@/lib/demo/accounts";

export type DemoSessionResult =
  | { ok: true; ticket: string }
  | { ok: false; message: string };

/* One-click demo sign-in: make sure the demo user exists (creating it on the
   first click — that's the "one-click sign-up"), then mint a short-lived
   Clerk sign-in token that the client redeems with the ticket strategy.
   Refuses outright unless DEMO_MODE=true. */
export async function startDemoSession(key: string): Promise<DemoSessionResult> {
  if (!isDemoMode()) return { ok: false, message: "Not found." };

  const account = getDemoAccount(key);
  if (!account) return { ok: false, message: "Unknown demo account." };

  try {
    const clerk = await clerkClient();
    const user = await ensureDemoClerkUser(clerk, account);
    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });
    return { ok: true, ticket: token.token };
  } catch (err) {
    console.error("[demo] startDemoSession failed", err);
    return {
      ok: false,
      message:
        "Couldn't open the demo account. Check that email + password sign-in is enabled in Clerk and run `npm run db:seed`.",
    };
  }
}
