"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { markComplete } from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/actions";
import { Button, Icon, toast } from "@/components/ui";

/* "Mark complete" in the focus header (feature 11). Once complete it
   stays complete; the action refreshes the page so the header count and
   the course contents update. */
export function MarkCompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const [pending, start] = useTransition();

  if (completed) {
    return (
      <Button variant="success" size="sm" leading={<Icon icon={Check} size={16} strokeWidth={2.2} />} disabled>
        <span className="hidden sm:inline">Completed</span>
        <span className="sm:hidden">Done</span>
      </Button>
    );
  }

  return (
    <Button
      variant="success"
      size="sm"
      loading={pending}
      leading={<Icon icon={Check} size={16} />}
      onClick={() =>
        start(async () => {
          const result = await markComplete(lessonId);
          if (!result.ok) toast.error(result.error.message);
        })
      }
    >
      <span className="hidden sm:inline">Mark complete</span>
      <span className="sm:hidden">Done</span>
    </Button>
  );
}
