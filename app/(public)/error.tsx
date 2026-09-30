"use client";

import { ErrorView } from "@/components/shell/error-view";

/* The public pages keep their header and footer (the layout) around the
   error (feature 30's pattern). */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} home={{ href: "/welcome", label: "Back to the home page" }} />;
}
