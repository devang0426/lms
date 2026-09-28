"use client";

import { ErrorView } from "@/components/shell/error-view";

/* Catch-all boundary for pages outside an app shell. Errors inside a shell
   are caught by that shell's own error.tsx, so the nav stays usable. */
export default function RootErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col px-5">
      <ErrorView {...props} />
    </main>
  );
}
