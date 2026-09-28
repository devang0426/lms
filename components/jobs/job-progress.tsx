"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Badge, Button, Icon, ProgressBar, StepIndicator, type BadgeTone, type StepState } from "@/components/ui";
import type { JobStatus } from "@/lib/db/schema";
import { jobStateFromRun, TERMINAL_JOB_STATES, type JobStage } from "@/lib/jobs/stages";
import { cn } from "@/lib/utils/cn";

/* Live progress for one background job (feature 09). The server passes the
   jobs row as `initial`, so a reload shows the last known state at once;
   while the run is active, Trigger.dev Realtime streams the task's
   metadata (stage, progress, message) with a token that can read only this
   run. When the run ends the page refreshes once to pick up the final row
   (the server reconciles the row with the run, see lib/jobs). */

export interface JobSnapshot {
  status: JobStatus;
  stage: string | null;
  progress: number;
  message: string | null;
  error: string | null;
}

const statusBadge: Record<JobStatus, { tone: BadgeTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "warning", label: "Running" },
  completed: { tone: "success", label: "Done" },
  failed: { tone: "new", label: "Failed" },
  canceled: { tone: "neutral", label: "Cancelled" },
};

export function JobProgress({
  runId,
  accessToken,
  stages,
  initial,
  title,
  retry,
}: {
  runId: string;
  accessToken: string;
  stages: readonly JobStage[];
  initial: JobSnapshot;
  title: string;
  /* A server action that starts a fresh run (and navigates to it). */
  retry?: () => Promise<void>;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const live = !TERMINAL_JOB_STATES.includes(initial.status);
  const refreshed = useRef(false);

  const { run, error: streamError } = useRealtimeRun(runId, {
    accessToken,
    enabled: live,
    onComplete: () => {
      if (refreshed.current) return;
      refreshed.current = true;
      router.refresh();
    },
  });

  const meta = (run?.metadata ?? {}) as Partial<Record<"stage" | "message", string> & { progress: number }>;
  const status: JobStatus = live && run ? jobStateFromRun(run.status) : initial.status;
  const stage = meta.stage ?? initial.stage;
  const progress = status === "completed" ? 100 : (meta.progress ?? initial.progress);
  const message = meta.message ?? initial.message;
  const current = stages.findIndex((s) => s.key === stage);

  function stepState(i: number): StepState {
    if (status === "completed" || i < current) return "done";
    if (i === current) return "current";
    return "upcoming";
  }

  const badge = statusBadge[status];

  return (
    <section aria-label={title} className="flex flex-col gap-5 rounded-card border border-line bg-paper p-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-h3 font-semibold">{title}</h2>
        <Badge tone={badge.tone} size="md" aria-live="polite">
          {badge.label}
        </Badge>
      </header>

      <ProgressBar value={progress} label={`${title} progress`} />

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3">
            <StepIndicator state={status === "failed" && i === current ? "current" : stepState(i)} />
            <span className={cn("text-[15px]", stepState(i) === "upcoming" ? "text-ink-soft" : "text-ink", i === current && "font-medium")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {status !== "failed" && message && (
        <p className="m-0 text-small text-ink-soft" aria-live="polite">
          {message}
        </p>
      )}

      {status === "failed" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-clay px-4 py-3">
          <span className="text-small text-clay-ink">
            {initial.error ?? "This job didn't finish. It's safe to try again."}
          </span>
          {retry && (
            <Button
              variant="secondary"
              size="sm"
              loading={retrying}
              leading={<Icon icon={RotateCcw} size={16} />}
              onClick={() => startRetry(() => retry())}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {streamError && live && (
        <p className="m-0 text-meta text-ink-soft">Live updates paused. Reload the page to check on it.</p>
      )}
    </section>
  );
}
