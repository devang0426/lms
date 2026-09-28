import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { JobProgress } from "@/components/jobs/job-progress";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, CardHeader, EmptyState, Eyebrow, Icon } from "@/components/ui";
import { VideoUploader } from "@/components/video/video-uploader";
import { requireCourseStaff } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { contentCounts } from "@/lib/db/lesson-content";
import { getJobAccessToken } from "@/lib/jobs";
import { VIDEO_STAGES } from "@/lib/jobs/stages";
import { formatClock } from "@/lib/utils/format";
import { getLessonVideoState } from "@/lib/video/lessons";
import { retryVideo } from "./actions";

/* Lesson editor (feature 10): upload a lecture, watch it process, preview
   the result. Progress survives closing the tab — the run lives on
   Trigger.dev and its state is read back here on every visit. */
export default async function LessonEditorPage({ params }: PageProps<"/instructor/courses/[courseId]/lessons/[lessonId]">) {
  const { courseId, lessonId } = await params;
  const user = await requireCourseStaff(courseId);
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.course.id !== courseId) notFound();
  const { lesson, module, course } = found;

  const backLink = (
    <Link href={`/instructor/courses/${courseId}`} className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
      <Icon icon={ArrowLeft} size={16} />
      {course.code} · Curriculum
    </Link>
  );
  const header = (
    <PageHeader
      eyebrow={`${module.title} · ${lesson.kind}`}
      title={lesson.title}
      actions={
        <>
          <StatusBadge status={lesson.status} size="lg" />
          <Button asChild variant="secondary" size="sm" leading={<Icon icon={Eye} size={16} />}>
            <Link href={`/courses/${courseId}/lessons/${lessonId}`}>Preview as student</Link>
          </Button>
        </>
      }
    />
  );

  if (lesson.kind !== "video") {
    return (
      <>
        {backLink}
        {header}
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="Nothing to upload here yet"
            description={`Content for ${lesson.kind} lessons arrives with a later feature. For now you can rename, reorder and publish it from the curriculum.`}
          />
        </Card>
      </>
    );
  }

  const [{ latest, live, job, segmentCount }, counts] = await Promise.all([getLessonVideoState(lessonId), contentCounts(lessonId)]);
  const token = job ? await getJobAccessToken(job) : null;
  const processing = latest?.status === "processing";
  const showJob = job && token && latest && (processing || latest.status === "failed" || (latest.status === "ready" && job.status !== "completed"));

  return (
    <>
      {backLink}
      {header}

      {live && (
        <Card className="gap-4">
          <CardHeader title={processing ? "Current video (still live while the new one processes)" : "Video"} />
          <video
            controls
            preload="metadata"
            crossOrigin="anonymous"
            poster={live.posterUrl ?? undefined}
            className="aspect-video w-full max-w-[880px] rounded-card bg-media"
          >
            <source src={live.blobUrl ?? undefined} type="video/mp4" />
            {live.vttUrl && <track kind="captions" src={live.vttUrl} srcLang="en" label="English" default />}
          </video>
          <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-small">
            <Fact label="Length" value={formatClock(live.durationSec ?? 0)} />
            <Fact label="Size" value={live.width && live.height ? `${live.width}×${live.height}` : "—"} />
            <Fact label="Transcript" value={`${segmentCount} segments`} />
            <Fact label="Captions" value={live.vttUrl ? "Ready" : "—"} />
          </dl>
        </Card>
      )}

      {live && (
        <Card className="gap-3">
          <CardHeader
            title="AI drafts"
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={`/instructor/courses/${courseId}/lessons/${lessonId}/review`}>Review and publish</Link>
              </Button>
            }
          />
          <p className="m-0 text-small text-ink-soft">
            {counts.chapters + counts.notes + counts.cards + counts.questions === 0
              ? "Chapters, notes, flashcards and a quiz are drafted after transcription. Check back once processing finishes."
              : `${counts.chapters} chapters · ${counts.notes ? "notes" : "no notes"} · ${counts.cards} flashcards · ${counts.questions} quiz questions${counts.drafts > 0 ? " · not yet published" : ""}`}
          </p>
        </Card>
      )}

      {showJob && (
        <JobProgress
          key={job.id}
          runId={job.triggerRunId}
          accessToken={token}
          stages={VIDEO_STAGES}
          title="Processing the video"
          initial={{ status: job.status, stage: job.stage, progress: job.progress, message: job.message, error: job.error }}
          retry={latest.status === "failed" ? retryVideo.bind(null, latest.id) : undefined}
        />
      )}

      {latest?.status === "rejected" && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          <strong className="font-medium">The last upload couldn&apos;t be used.</strong> {latest.error}
        </p>
      )}

      {!processing && (
        <Card className="gap-4">
          <CardHeader title={live ? "Replace the video" : "Upload video"} />
          {latest?.status === "uploading" && (
            <p className="m-0 text-small text-ink-soft">An earlier upload didn&apos;t finish. Choose the file again to restart it.</p>
          )}
          <VideoUploader lessonId={lesson.id} replacing={Boolean(live)} />
          <p className="m-0 text-meta text-ink-soft">
            After upload we check the file, make it stream quickly, pick a poster frame and transcribe it with timestamps.
            Students see it once the lesson is published.
          </p>
        </Card>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="m-0">{value}</dd>
    </div>
  );
}
