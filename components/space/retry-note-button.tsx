"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Icon } from "@/components/ui";
import type { ActionResult } from "@/lib/utils/action-result";

/* A failed note's "Try again" (features 19 and 25). The retry is refused
   when the note didn't fail, or over the daily AI limit; the reason shows
   under the button. On success the page revalidates to the new run. */
export function RetryNoteButton({ retry }: { retry: () => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        leading={<Icon icon={RotateCcw} size={16} />}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const res = await retry();
              if (!res.ok) setError(res.error.message);
            } catch {
              setError("Something went wrong. Try again in a moment.");
            }
          })
        }
      >
        Try again
      </Button>
      {error && (
        <p role="alert" className="m-0 text-small text-clay-ink">
          {error}
        </p>
      )}
    </div>
  );
}
