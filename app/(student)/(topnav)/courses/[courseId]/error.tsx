"use client";

import { ErrorView } from "@/components/shell/error-view";

/* A course page that fails inside the top-nav shell (feature 30): the
   shell is this folder's layout, so its navigation stays. */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} />;
}
