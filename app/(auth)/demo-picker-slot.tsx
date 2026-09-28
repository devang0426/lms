import { DemoAccountPicker } from "@/components/auth/demo-account-picker";
import { DEMO_ACCOUNTS, demoPassword, isDemoMode } from "@/lib/demo/accounts";

/* Server wrapper: renders the demo picker only when DEMO_MODE=true, so the
   demo credentials never reach the page otherwise. */
export function DemoPickerSlot() {
  if (!isDemoMode()) return null;

  const password = demoPassword();
  const accounts = DEMO_ACCOUNTS.map((a) => ({
    key: a.key,
    name: `${a.key === "admin" ? "Prof. " : ""}${a.firstName} ${a.lastName}`,
    label: a.label,
    shows: a.shows,
    email: a.email,
    password,
  }));

  return <DemoAccountPicker accounts={accounts} />;
}
