"use client";

import { ErrorView } from "@/components/shell/error-view";
import { AuthShell } from "./auth-shell";

/* Sign-in and sign-up have no layout (each page draws the AuthShell), so
   the error page draws it too (feature 30). */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <AuthShell>
      <ErrorView {...props} home={{ href: "/sign-in", label: "Back to sign in" }} />
    </AuthShell>
  );
}
