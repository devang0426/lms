import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "../../auth-shell";
import { DemoPickerSlot } from "../../demo-picker-slot";

/* Open sign-up exists for development only. Before a real rollout, set the
   Clerk sign-up mode to "Restricted" so accounts come from roster/invites.
   In demo mode the demo accounts sit above the form: one click creates
   (first time) and signs in. */
export default function SignUpPage() {
  return (
    <AuthShell>
      <DemoPickerSlot />
      <SignUp />
    </AuthShell>
  );
}
