"use client";

import { ErrorView } from "@/components/shell/error-view";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView {...props} home={{ href: "/admin", label: "Back to admin" }} />;
}
