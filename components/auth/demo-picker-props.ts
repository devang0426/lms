import "server-only";

import { DEMO_ACCOUNTS, demoPasscode, demoPassword, isDemoMode } from "@/lib/demo/accounts";
import type { DemoAccountCard } from "./demo-account-picker";

/* What the demo picker shows, or null when DEMO_MODE isn't "true", so the
   demo credentials never reach a page otherwise. Behind a passcode
   (feature 24) the password isn't shown either: with it, anyone could
   type their way past the passcode in the normal form. Used by the
   sign-in page and the landing page's "Try the demo" (feature 34). */
export function demoPickerProps(): { accounts: DemoAccountCard[]; needsPasscode: boolean } | null {
  if (!isDemoMode()) return null;

  const needsPasscode = demoPasscode() !== null;
  const password = needsPasscode ? null : demoPassword();
  const accounts = DEMO_ACCOUNTS.map((a) => ({
    key: a.key,
    name: `${a.key === "admin" ? "Prof. " : ""}${a.firstName} ${a.lastName}`,
    label: a.label,
    shows: a.shows,
    email: a.email,
    password,
  }));
  return { accounts, needsPasscode };
}
