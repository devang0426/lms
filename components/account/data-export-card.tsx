"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestDataExport } from "@/app/(student)/(sidebar)/profile/actions";
import { LocalDate } from "@/components/coursework/local-date";
import { JobProgress, type JobSnapshot } from "@/components/jobs/job-progress";
import { Button, Card, Icon } from "@/components/ui";
import { EXPORT_DAYS, fileSizeLabel } from "@/lib/account/rules";
import { EXPORT_STAGES } from "@/lib/jobs/stages";
import { settle } from "@/lib/utils/action-result";

/* The Profile page's "Your data" card (feature 33). Asking starts a
   background task; while it runs, its progress shows live and the page
   refreshes when it ends. A ready file downloads through /exports/[id],
   which checks it's yours and not expired. Dates arrive as epoch ms. */

export type ExportCardView =
  | { phase: "none" }
  | { phase: "building"; run: { id: string; accessToken: string; job: JobSnapshot } | null }
  | { phase: "ready"; exportId: string; expiresAt: number; sizeBytes: number | null }
  | { phase: "failed"; message: string };

export function DataExportCard({ view }: { view: ExportCardView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();

  function ask() {
    setError(null);
    startAsking(async () => {
      const res = await settle(requestDataExport());
      if (!res.ok) return setError(res.error.message);
      router.refresh();
    });
  }

  const askButton = (label: string, variant: "primary" | "quiet") => (
    <Button variant={variant} size="md" className="self-start" loading={asking} onClick={ask}>
      {label}
    </Button>
  );

  return (
    <Card className="max-w-[560px] gap-4">
      <h2 className="m-0 text-h3 font-semibold">
        Your data
      </h2>
      <p className="m-0 text-small text-ink-soft">
        Download a copy of what Studyhall keeps about you: your courses, study history, notes, quiz attempts, work, grades, posts,
        private space and assistant chats. It&apos;s one JSON file, and the link works for {EXPORT_DAYS} days.
      </p>

      {view.phase === "none" && askButton("Prepare my data", "primary")}

      {view.phase === "building" &&
        (view.run ? (
          <JobProgress runId={view.run.id} accessToken={view.run.accessToken} stages={EXPORT_STAGES} initial={view.run.job} title="Preparing your file" />
        ) : (
          <p className="m-0 text-small" role="status">
            Preparing your file…
          </p>
        ))}

      {view.phase === "ready" && (
        <>
          <p className="m-0 text-small" role="status">
            Your file is ready{view.sizeBytes !== null ? ` (${fileSizeLabel(view.sizeBytes)})` : ""}. The link works until{" "}
            <LocalDate at={view.expiresAt} dateOnly />.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary" size="md">
              <a href={`/exports/${view.exportId}`}>
                <Icon icon={Download} size={17} />
                Download my data
              </a>
            </Button>
            {askButton("Prepare a new copy", "quiet")}
          </div>
        </>
      )}

      {view.phase === "failed" && (
        <>
          <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
            {view.message}
          </p>
          {askButton("Try again", "quiet")}
        </>
      )}

      {error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {error}
        </p>
      )}
    </Card>
  );
}
