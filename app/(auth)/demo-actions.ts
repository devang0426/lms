"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { demoPasscode, ensureDemoClerkUser, getDemoAccount, isDemoMode, passcodeMatches } from "@/lib/demo/accounts";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

const input = z.object({ key: z.string().max(20), passcode: z.string().max(200).optional() });

/* One-click demo sign-in: make sure the demo user exists (creating it on the
   first click — that's the "one-click sign-up"), then mint a short-lived
   Clerk sign-in token that the client redeems with the ticket strategy.
   Refuses outright unless DEMO_MODE=true, and without the passcode when
   DEMO_PASSCODE is set (feature 24; always set on production). */
export const startDemoSession = safeAction("startDemoSession", async (
  raw: z.input<typeof input>,
): Promise<ActionResult<{ ticket: string }>> => {
  if (!isDemoMode()) return fail("not_found", "Not found.");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("invalid", "Unknown demo account.");

  const expected = demoPasscode();
  if (expected && !passcodeMatches(parsed.data.passcode ?? "", expected)) {
    return fail("unauthorized", "That passcode isn't right.");
  }

  const account = getDemoAccount(parsed.data.key);
  if (!account) return fail("invalid", "Unknown demo account.");

  try {
    const clerk = await clerkClient();
    const user = await ensureDemoClerkUser(clerk, account);
    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });
    return ok({ ticket: token.token });
  } catch (err) {
    console.error("[demo] startDemoSession failed", err);
    return fail(
      "internal",
      "Couldn't open the demo account. Check that email + password sign-in is enabled in Clerk and run `npm run db:seed`.",
    );
  }
});
