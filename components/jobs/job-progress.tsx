"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, ProgressBar, StepIndicator, type BadgeTone, type StepState } from "@/components/ui";
import type { JobStatus } from "@/lib/db/schema";
import { jobStateFromRun, TERMINAL_JOB_STATES, type JobStage } from "@/lib/jobs/stages";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";
import { RetryNotice } from "./retry-notice";

/* Live progress for one background job (feature 09). The server passes the
   jobs row as `initial`, so a reload shows the last known state at once;
   while the run is active, Trigger.dev Realtime streams the task's
   metadata (stage, progress, message) with a token that can read only this
   run. When the run ends the page refreshes once to pick up the final row
   (the server reconciles the row with the run, see lib/jobs). A run still
   queued after 3 minutes gets a "worker may be offline" hint (feature 26);
   it expires after its TTL (lib/jobs) and can then be retried. */

const QUEUED_HINT_AFTER_MS = 3 * 60_000;

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
  /* A server action that starts a fresh run (and navigates to it). If it
     returns a refusal (e.g. the daily AI limit), its message is shown. */
  retry?: () => Promise<void | ActionResult>;
}) {
  const router = useRouter();
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

  // Re-render once the run has sat in the queue long enough for the hint.
  const queuedSince = status === "queued" && run ? new Date(run.createdAt).getTime() : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (queuedSince === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, queuedSince + QUEUED_HINT_AFTER_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [queuedSince]);
  const stalled = queuedSince !== null && now !== null && now - queuedSince >= QUEUED_HINT_AFTER_MS;

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

      {stalled && (
        <p role="status" className="m-0 rounded-xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
          Processing hasn&apos;t started. The background worker may be offline.
          {process.env.NODE_ENV === "development" && (
            <>
              {" "}
              Run <code className="font-mono">npm run dev:all</code>.
            </>
          )}
        </p>
      )}

      {status === "failed" && <RetryNotice message={initial.error ?? "This job didn't finish. It's safe to try again."} retry={retry} />}

      {streamError && live && (
        <p className="m-0 text-meta text-ink-soft">Live updates paused. Reload the page to check on it.</p>
      )}
    </section>
  );
}
