import { Play } from "lucide-react";
import Link from "next/link";
import { JobProgress } from "@/components/jobs/job-progress";
import { Badge, Button, Card, CardHeader, Eyebrow, Icon, ListRow } from "@/components/ui";
import { listRecentUsage } from "@/lib/ai/usage";
import { requireRole } from "@/lib/auth";
import { isUuid } from "@/lib/db/courses";
import { getJobAccessToken, getJobForViewer, listRecentJobs } from "@/lib/jobs";
import { HELLO_STAGES } from "@/lib/jobs/stages";
import { retryHello, startHello } from "./actions";
import { UploadTester } from "./upload-tester";

export const metadata = { title: "Jobs check · Studyhall" };

/* Feature 09 check page (admin only): a test upload to Blob, the `hello`
   Trigger.dev task with live progress, and the latest ai_usage rows. */
export default async function DevJobsPage({ searchParams }: PageProps<"/dev/jobs">) {
  const user = await requireRole("admin");
  const { job: jobParam } = await searchParams;
  const jobId = typeof jobParam === "string" && isUuid(jobParam) ? jobParam : null;

  const job = jobId ? await getJobForViewer(jobId, user) : null;
  const [token, recent, usage] = await Promise.all([
    job ? getJobAccessToken(job) : Promise.resolve(null),
    listRecentJobs(user.id),
    listRecentUsage(),
  ]);

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-8 px-5 py-10 md:px-12">
      <header className="flex flex-col gap-2">
        <Eyebrow>Dev · feature 09</Eyebrow>
        <h1 className="m-0 font-serif text-h1 font-normal">
          Storage, jobs <em>&amp; AI</em>
        </h1>
        <p className="m-0 text-small text-ink-soft">
          Needs <code className="font-mono">npm run dev:all</code> so the Trigger.dev dev worker is running.
        </p>
      </header>

      <Card className="gap-4">
        <CardHeader title="Upload a test file" />
        <p className="m-0 text-small text-ink-soft">Text, PNG, JPEG or PDF up to 10 MB. It goes straight to Vercel Blob.</p>
        <UploadTester userId={user.id} />
      </Card>

      <Card className="gap-4">
        <CardHeader title="Run the hello task" />
        <form action={startHello} className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" name="withAi" defaultChecked className="size-4 accent-terracotta" />
            Include one tiny AI call (logs to ai_usage)
          </label>
          <Button type="submit" leading={<Icon icon={Play} size={16} />}>
            Run hello
          </Button>
        </form>
      </Card>

      {job && token && (
        <JobProgress
          key={job.id}
          runId={job.triggerRunId}
          accessToken={token}
          stages={HELLO_STAGES}
          title="hello"
          initial={{ status: job.status, stage: job.stage, progress: job.progress, message: job.message, error: job.error }}
          retry={retryHello.bind(null, job.id)}
        />
      )}
      {jobId && !job && <p className="m-0 text-small text-ink-soft">That job wasn&apos;t found.</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="gap-2">
          <CardHeader title="Recent jobs" />
          {recent.length === 0 && <p className="m-0 text-small text-ink-soft">None yet.</p>}
          {recent.map((j, i) => (
            <ListRow
              key={j.id}
              divider={i < recent.length - 1}
              title={<Link href={`/dev/jobs?job=${j.id}`}>{j.kind}</Link>}
              subtitle={`${j.createdAt.toISOString().replace("T", " ").slice(0, 19)} · ${j.progress}%`}
              trailing={
                <Badge size="sm" tone={j.status === "completed" ? "success" : j.status === "failed" ? "new" : "neutral"}>
                  {j.status}
                </Badge>
              }
            />
          ))}
        </Card>
        <Card className="gap-2">
          <CardHeader title="Latest ai_usage" />
          {usage.length === 0 && <p className="m-0 text-small text-ink-soft">No AI calls logged yet.</p>}
          {usage.map((u, i) => (
            <ListRow
              key={u.id}
              divider={i < usage.length - 1}
              title={`${u.feature} · ${u.task}`}
              subtitle={`${u.model} · ${u.inputTokens} in / ${u.outputTokens} out`}
              trailing={
                <span className="font-mono">
                  ${Number(u.costUsd).toFixed(6)}
                  {u.estimated ? " est." : ""}
                </span>
              }
            />
          ))}
        </Card>
      </div>
    </main>
  );
}
