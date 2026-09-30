"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button, Card, Eyebrow, Icon, StepIndicator } from "@/components/ui";
import type { SetupStep } from "@/lib/courses/setup";
import { cn } from "@/lib/utils/cn";

/* "Get your course live" (feature 27, N8), on the overview and the course
   page until every step is done. The steps come from the data
   (setupSteps); hiding the list is remembered per course in this browser
   only. */

const dismissKey = (courseId: string) => `studyhall.setup-dismissed.${courseId}`;

function readDismissed(courseId: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(courseId)) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function SetupChecklist({
  courseId,
  course,
  steps,
  here,
}: {
  courseId: string;
  /* "MATH 201 · Linear Algebra", on the overview. */
  course?: string;
  steps: SetupStep[];
  /* The page showing the list: a step done right here (the curriculum
     below it) gets no link to itself. */
  here?: string;
}) {
  // The server renders the list; a browser that hid it hides it on hydration.
  const stored = useSyncExternalStore(subscribe, () => readDismissed(courseId), () => false);
  const [hidden, setHidden] = useState(false);
  if (stored || hidden) return null;

  const done = steps.filter((s) => s.done).length;
  function dismiss() {
    try {
      window.localStorage.setItem(dismissKey(courseId), "1");
    } catch {
      // Private mode or blocked storage: hide it for this visit only.
    }
    setHidden(true);
  }

  return (
    <Card role="region" className="gap-4" aria-labelledby={`setup-${courseId}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>
            {done} of {steps.length} done{course ? ` · ${course}` : ""}
          </Eyebrow>
          <h2 id={`setup-${courseId}`} className="m-0 text-h3 font-semibold">
            Get your course live
          </h2>
        </div>
        <Button variant="icon" size="xs" className="border-transparent bg-transparent text-ink-soft" aria-label="Hide this checklist" onClick={dismiss}>
          <Icon icon={X} size={16} />
        </Button>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0">
            <StepIndicator state={step.done ? "done" : step.current ? "current" : "upcoming"} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
              <span className={cn("text-[15px]", step.current && "font-medium", step.done && "text-ink-soft")}>{step.title}</span>
              <span className="text-meta text-ink-soft">{step.hint}</span>
            </span>
            {!step.done && step.href && step.href !== here && step.action && (
              <Button asChild variant={step.current ? "secondary" : "quiet"} size="xs">
                <Link href={step.href}>{step.action}</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
