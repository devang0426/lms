"use client";

import { ErrorHeader, ErrorView } from "@/components/shell/error-view";

/* When the course shell itself fails (courses/[courseId]/layout). An error
   inside the shell is caught by courses/[courseId]/error.tsx, which keeps
   the top nav (feature 30). */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  const home = { href: "/", label: "Back to home" };
  return (
    <div className="flex min-h-dvh flex-col">
      <ErrorHeader back={home} />
      <main className="flex flex-1 flex-col px-5">
        <ErrorView {...props} home={home} />
      </main>
    </div>
  );
}
