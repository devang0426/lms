"use client";

import { DemoAccountPicker, type DemoAccountCard } from "@/components/auth/demo-account-picker";
import { Button, Dialog, DialogContent, DialogTrigger } from "@/components/ui";

/* The landing page's "Try the demo" (feature 34): the sign-in page's demo
   picker in a dialog. Rendered only while DEMO_MODE=true
   (demoPickerProps), with the same passcode rule as sign-in. */
export function TryDemo({ accounts, needsPasscode }: { accounts: DemoAccountCard[]; needsPasscode: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="xl">
          Try the demo
        </Button>
      </DialogTrigger>
      <DialogContent title="Try the demo" description="Look around as a teacher or as a student, with a real course.">
        <DemoAccountPicker accounts={accounts} needsPasscode={needsPasscode} emailDivider={false} />
      </DialogContent>
    </Dialog>
  );
}
