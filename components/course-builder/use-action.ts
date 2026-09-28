"use client";

import { useTransition } from "react";
import { toast } from "@/components/ui";
import type { ActionResult } from "@/lib/utils/action-result";

/* Run a server action in a transition and toast its error. The action's
   revalidatePath refreshes the page, so success needs no extra work. */
export function useAction() {
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) {
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) onSuccess?.(res.data);
        else toast.error(res.error.message);
      } catch {
        toast.error("Something went wrong. Try again in a moment.");
      }
    });
  }

  return { pending, run };
}
