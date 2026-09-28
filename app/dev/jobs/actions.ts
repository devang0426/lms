"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getJobForViewer, startJob } from "@/lib/jobs";

/* /dev/jobs check page (feature 09). Admin only. */

export async function startHello(formData: FormData): Promise<void> {
  const user = await requireRole("admin");
  const withAi = formData.get("withAi") === "on";
  const job = await startJob({
    kind: "hello",
    entity: { type: "user", id: user.id },
    payload: { userId: user.id, withAi },
    createdBy: user.id,
    // A fresh key per click: every press is a new run.
    idempotencyKey: `hello:${user.id}:${Date.now()}`,
  });
  redirect(`/dev/jobs?job=${job.id}`);
}

export async function retryHello(jobId: string): Promise<void> {
  const user = await requireRole("admin");
  const previous = await getJobForViewer(jobId, user);
  if (!previous) redirect("/dev/jobs");
  const job = await startJob({
    kind: "hello",
    entity: { type: previous.entityType, id: previous.entityId },
    payload: { userId: user.id, withAi: false },
    createdBy: user.id,
    idempotencyKey: `hello:${user.id}:retry:${jobId}:${Date.now()}`,
  });
  redirect(`/dev/jobs?job=${job.id}`);
}
