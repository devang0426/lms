import { Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { JobProgress } from "@/components/jobs/job-progress";
import { CardsEditor } from "@/components/lesson-review/cards-editor";
import { ChaptersEditor } from "@/components/lesson-review/chapters-editor";
import { NotesEditor } from "@/components/lesson-review/notes-editor";
import { QuizEditor } from "@/components/lesson-review/quiz-editor";
import { PublishButton, RegenerateButton, type ContentKind } from "@/components/lesson-review/shared";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { loadLessonReview } from "@/lib/db/lesson-review";
import type { Job } from "@/lib/db/schema";
import { getJobAccessToken } from "@/lib/jobs";
import { JOB_STAGES, TERMINAL_JOB_STATES } from "@/lib/jobs/stages";
import { blocksToMarkdown } from "@/lib/markdown";

/* Review AI lesson content (feature 12): chapters, notes, flashcards and
   quiz, each editable in place and regenerable per tab. Publish puts the
   lesson and every item live together; until then students see nothing.
   Feature 29: getLessonForUser is the only access check (course staff
   only), then one batch (loadLessonReview) reads the rest. */
export default async function LessonReviewPage({
  params,
}: PageProps<"/instructor/courses/[courseId]/lessons/[lessonId]/review">) {
  const { courseId, lessonId } = await params;
  const user = await requireUser();
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.course.id !== courseId || found.access !== "staff") notFound();
  const { lesson, module, course } = found;

  const { source, content, counts, jobs: latest } = await loadLessonReview(lessonId);
  const jobs = await Promise.all(
    (["chapters", "notes", "cards", "quiz"] as const).map(async (kind) => {
      const job = latest[kind];
      const active = job && !TERMINAL_JOB_STATES.includes(job.status);
      const failed = job?.status === "failed";
      return [kind, job && (active || failed) ? { job, token: await getJobAccessToken(job) } : null] as const;
    }),
  );
  const running = Object.fromEntries(jobs) as Record<ContentKind, { job: Job; token: string } | null>;

  const editorHref = `/instructor/courses/${courseId}/lessons/${lessonId}`;
  const playerHref = `/courses/${courseId}/lessons/${lessonId}`;
  const published = lesson.status === "published";

  const header = (
    <>
      <Breadcrumbs
        items={[
          { label: course.code, href: `/instructor/courses/${courseId}` },
          { label: module.title },
          { label: lesson.title, href: editorHref },
          { label: "Review" },
        ]}
      />
      <PageHeader
        eyebrow={`${module.title} · Review AI drafts`}
        title={lesson.title}
        actions={
          <>
            <StatusBadge status={lesson.status} size="lg" />
            <Button asChild variant="secondary" size="md" leading={<Icon icon={Eye} size={16} />}>
              <Link href={playerHref}>Preview as student</Link>
            </Button>
            {source && <PublishButton lessonId={lessonId} drafts={counts.drafts} published={published} />}
          </>
        }
      />
    </>
  );

  if (!source) {
    return (
      <>
        {header}
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="Nothing to review yet"
            description={
              lesson.kind === "reading"
                ? "Once a document is added and read, the AI drafts notes, flashcards and a quiz from it for you to check here."
                : "Once the lecture video is uploaded and transcribed, the AI drafts chapters, notes, flashcards and a quiz for you to check here."
            }
            action={
              <Button asChild variant="secondary" size="md">
                <Link href={editorHref}>{lesson.kind === "reading" ? "Go to the documents" : "Go to the video"}</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  // Drafted from documents (a reading lesson, feature 18): no chapters.
  const fromDocuments = source.mode === "document";
  const noteItems = (content.note?.blocks ?? []).map((b) => ({
    markdown: blocksToMarkdown([b]),
    startSec: b.startSec ?? null,
    heading: b.type.startsWith("heading"),
  }));

  const tab = (kind: ContentKind, count: number, body: React.ReactNode, emptyLabel: string) => {
    const run = running[kind];
    return (
      <TabsContent value={kind} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-small text-ink-soft">{tabHints[kind]}</p>
          <RegenerateButton lessonId={lessonId} kind={kind} disabled={Boolean(run && run.job.status !== "failed")} />
        </div>
        {run && (
          <JobProgress
            key={run.job.id}
            runId={run.job.triggerRunId}
            accessToken={run.token}
            stages={JOB_STAGES[`generate-${kind}`]}
            title={`Redrafting the ${tabLabels[kind].toLowerCase()}`}
            initial={{ status: run.job.status, stage: run.job.stage, progress: run.job.progress, message: run.job.message, error: run.job.error }}
          />
        )}
        {count === 0 ? (
          <Card padded={false} className="border-dashed">
            <EmptyState title={`No ${emptyLabel} yet`} description="They appear here once the AI has drafted them. If drafting stopped, use Regenerate." />
          </Card>
        ) : (
          body
        )}
      </TabsContent>
    );
  };

  return (
    <>
      {header}
      {!published && (
        <p className="m-0 rounded-2xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
          Everything here is a draft. Students see this lesson and its content only after you publish it
          {module.status !== "published" ? ", and once its module is published in the curriculum" : ""}.
        </p>
      )}
      {published && module.status !== "published" && (
        <p className="m-0 rounded-2xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
          This lesson is published, but its module is still a draft, so students can&apos;t see it yet. Publish the module
          in the curriculum.
        </p>
      )}

      <Tabs defaultValue={fromDocuments ? "notes" : "chapters"} className="flex flex-col">
        <TabsList aria-label="Lesson content">
          {!fromDocuments && (
            <TabsTrigger value="chapters" count={content.chapters.length}>
              Chapters
            </TabsTrigger>
          )}
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="cards" count={content.cards.length}>Flashcards</TabsTrigger>
          <TabsTrigger value="quiz" count={content.questions.length}>Quiz</TabsTrigger>
        </TabsList>
        {!fromDocuments && tab(
          "chapters",
          content.chapters.length,
          <ChaptersEditor
            lessonId={lessonId}
            playerHref={playerHref}
            chapters={content.chapters.map((c) => ({ id: c.id, title: c.title, startSec: c.startSec, summary: c.summary }))}
          />,
          "chapters",
        )}
        {tab("notes", noteItems.length, <NotesEditor key={content.note?.updatedAt.toISOString()} lessonId={lessonId} items={noteItems} />, "notes")}
        {tab(
          "cards",
          content.cards.length,
          <CardsEditor
            lessonId={lessonId}
            playerHref={playerHref}
            cards={content.cards.map((c) => ({
              id: c.id,
              front: c.front,
              back: c.back,
              topic: c.topic,
              startSec: c.startSec,
              published: c.status === "published",
            }))}
          />,
          "flashcards",
        )}
        {tab(
          "quiz",
          content.questions.length,
          <QuizEditor
            lessonId={lessonId}
            playerHref={playerHref}
            questions={content.questions.map((q) => ({
              id: q.id,
              type: q.type,
              difficulty: q.difficulty,
              bank: q.bank,
              topic: q.topic,
              question: q.question,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              startSec: q.startSec,
              published: q.status === "published",
            }))}
          />,
          "quiz questions",
        )}
      </Tabs>
    </>
  );
}

const tabLabels: Record<ContentKind, string> = { chapters: "Chapters", notes: "Notes", cards: "Flashcards", quiz: "Quiz" };

const tabHints: Record<ContentKind, string> = {
  chapters: "Where each topic starts. Students jump between chapters from the player and the scrubber.",
  notes: "Study notes, one section per chapter. Headings with a time link into the video.",
  cards: "Flashcards for review. Students study them with spaced repetition: each card comes back just before it's forgotten.",
  quiz: "Eight questions at each level. Mark any you want in the graded bank.",
};
