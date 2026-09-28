import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "../../auth-shell";
import { DemoPickerSlot } from "../../demo-picker-slot";

export default function SignInPage() {
  return (
    <AuthShell>
      <DemoPickerSlot />
      <SignIn />
    </AuthShell>
  );
}
