"use client";

import { useEffect } from "react";
import { Button, EmptyState, Eyebrow } from "@/components/ui";

/* Shared body for error.tsx boundaries. Never shows the raw message: server
   errors only carry a digest, which is enough to find the log line. */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <EmptyState
        title={
          <>
            Something went <em>sideways.</em>
          </>
        }
        description="This page didn't load properly. Try again, and if it keeps happening, let your instructor or the university admin know."
        action={
          <div className="flex flex-col items-center gap-3">
            <Button onClick={() => retry()}>Try again</Button>
            {error.digest && <Eyebrow>Ref · {error.digest}</Eyebrow>}
          </div>
        }
      />
    </div>
  );
}
