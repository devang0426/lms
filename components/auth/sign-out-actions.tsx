"use client";

import { SignOutButton } from "@clerk/nextjs";
import { ArrowLeftRight, LogOut } from "lucide-react";
import { Button, Icon } from "@/components/ui";

/* Full-width sign-out buttons for the Profile page (the mobile home for the
   account menu). Both return to /sign-in, where the demo picker lives. */
export function SignOutActions({ demoMode }: { demoMode: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {demoMode && (
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="quiet" leading={<Icon icon={ArrowLeftRight} />}>
            Switch demo account
          </Button>
        </SignOutButton>
      )}
      <SignOutButton redirectUrl="/sign-in">
        <Button variant="secondary" leading={<Icon icon={LogOut} />}>
          Sign out
        </Button>
      </SignOutButton>
    </div>
  );
}
