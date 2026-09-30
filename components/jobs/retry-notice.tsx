"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Icon } from "@/components/ui";
import type { ActionResult } from "@/lib/utils/action-result";

/* "This stopped. Try again." for a job that failed: JobProgress's failed
   block, and on its own where there's no run left to show, e.g. a video
   whose processing couldn't be queued (feature 26). */
export function RetryNotice({
  message,
  retry,
}: {
  message: string;
  /* A server action that starts a fresh run. If it returns a refusal
     (e.g. the daily AI limit, or the queue still down), its message
     replaces this one. */
  retry?: () => Promise<void | ActionResult>;
}) {
  const [retrying, startRetry] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-clay px-4 py-3">
      <span className="text-small text-clay-ink">{retryError ?? message}</span>
      {retry && (
        <Button
          variant="secondary"
          size="sm"
          loading={retrying}
          leading={<Icon icon={RotateCcw} size={16} />}
          onClick={() =>
            startRetry(async () => {
              setRetryError(null);
              const res = await retry();
              if (res && !res.ok) setRetryError(res.error.message);
            })
          }
        >
          Try again
        </Button>
      )}
    </div>
  );
}
