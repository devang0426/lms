import { ArrowLeft, ArrowRight, MessageCirclePlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ChapterList } from "@/components/player/chapter-list";
import { CourseContents } from "@/components/player/course-contents";
import { LazyAssistantChat, LazyPodcastTab, LazyQuizTab } from "@/components/player/lazy-tabs";
import { MarkCompleteButton } from "@/components/player/mark-complete-button";
import { NotesTab } from "@/components/player/notes-tab";
import { PlayerProvider } from "@/components/player/player-context";
import { TranscriptPanel } from "@/components/player/transcript-panel";
import { VideoPlayer, type PlayerChapter } from "@/components/player/video-player";
import { ResourceList } from "@/components/documents/resource-list";
import { FocusHeader } from "@/components/shell/focus-header";
import { Badge, Button, Card, EmptyState, Eyebrow, Icon, SkeletonRegion, SkeletonText, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { DiscussionList } from "@/components/discussions/discussion-list";
import { NewDiscussionDialog } from "@/components/discussions/new-discussion-dialog";
import type { DiscussionSummary } from "@/lib/db/discussions";
import { toTurnView } from "@/lib/ai/assistant";
import { requireAreaRole } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { loadLessonPlayer, loadPlayerPanels } from "@/lib/db/player";
import { formatLessonLength } from "@/lib/utils/format";
import { StudyNotes } from "@/components/player/study-notes";
import { FlashcardDeck } from "@/components/study/flashcard-deck";
import { renderCards } from "@/components/study/render-cards";
import type { QuizTabData } from "@/lib/db/quizzes";
import type { StudyQueue } from "@/lib/db/study";
import type { PodcastEpisodes } from "@/lib/study/podcast";
import type { DocumentView } from "@/lib/documents/view";
import { AssignmentPanel } from "@/components/coursework/assignment-panel";
import { requestTime } from "@/lib/utils/clock";

/* Lesson player (wireframe 05, features 11, 12, 14 (Ask), 15 (Flashcards), 16 (Quiz), 17 (Podcast), 18 (Resources), 20 (assignments) and 21 (Discussion)). getLessonForUser is the gate:
   a student gets the lesson only when enrolled and the course, module and
   lesson are all published; anything else is a 404 before any video URL
   is loaded. Staff open the same page as a preview (drafts included, no
   progress recorded).
   Feature 29: after the gate, one batch (loadLessonPlayer) holds what the
   page needs to render. The closed tabs' bodies (Transcript, Flashcards,
   Quiz, Podcast, Discussion) are a second batch (loadPlayerPanels), sent
   once the first is back, and stream in behind Suspense (the podcast may
   ask Trigger.dev about a run). Sent together with the first, it would
   open a new connection to Neon (~1.2 s from India) and slow it down. The Ask, Quiz and Podcast tabs' client code loads
   when the tab is first opened. */
export default async function LessonPlayerPage({ params }: PageProps<"/courses/[courseId]/lessons/[lessonId]">) {
  const { courseId, lessonId } = await params;
  const user = await requireAreaRole("student", "admin", "instructor");
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.course.id !== courseId) notFound();
  const { lesson, module, course } = found;
  const preview = found.access === "staff";

  const data = await loadLessonPlayer(found, user);
  const panels = loadPlayerPanels(found, user);
  const segments = early(panels.then((p) => p.segments));
  const deck = early(panels.then((p) => p.deck));
  const quiz = early(panels.then((p) => p.quiz));
  const podcast = early(panels.then((p) => p.podcast));
  const threads = early(panels.then((p) => p.threads));
  const { modules, video, progress, notes, completed, studyNotes, deckCount, work, hasQuiz, showPodcast } = data;
  const chapters: PlayerChapter[] = data.chapters;
  const askThread = data.thread;
  const resourceViews: DocumentView[] = data.documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    status: d.status,
    pageCount: d.pageCount,
    durationSec: d.durationSec,
    sizeBytes: d.sizeBytes,
    hasFile: d.hasFile,
  }));

  const ordered = modules.flatMap((m) => m.lessons);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 ? (ordered[index + 1] ?? null) : null;
  const doneCount = ordered.filter((l) => completed.has(l.id)).length;
  const lessonHref = (id: string) => `/courses/${courseId}/lessons/${id}`;

  return (
    <>
      <FocusHeader
        backHref={preview ? `/instructor/courses/${courseId}/lessons/${lessonId}` : `/courses/${courseId}`}
        courseName={`${course.code} · ${course.title}`}
        moduleTitle={module.title}
        done={doneCount}
        total={ordered.length}
        completeAction={
          preview ? (
            <Badge tone="warning">Preview</Badge>
          ) : (
            <MarkCompleteButton lessonId={lessonId} completed={Boolean(progress?.completedAt)} />
          )
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PlayerProvider key={lessonId} initialDuration={video?.durationSec ?? lesson.durationSec ?? 0}>
          <main className="flex min-w-0 flex-1 flex-col gap-6 px-5 py-6 md:px-10 md:py-8">
            <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
              {video ? (
                <VideoPlayer
                  lessonId={lessonId}
                  src={video.blobUrl!}
                  poster={video.posterUrl}
                  captionsUrl={video.vttUrl}
                  chapters={chapters}
                  savedPositionSec={progress?.positionSec ?? null}
                  initialRanges={progress?.watchedRanges ?? []}
                  trackProgress={!preview}
                />
              ) : lesson.kind === "assignment" ? (
                <AssignmentPanel
                  lessonId={lessonId}
                  userId={user.id}
                  assignment={work?.assignment ?? null}
                  submission={work?.submission ?? null}
                  grade={work?.grade ?? null}
                  preview={preview}
                  now={requestTime()}
                />
              ) : lesson.kind === "reading" ? (
                <section aria-label="Reading material" className="flex flex-col gap-2 rounded-card border border-line bg-paper px-6 py-5">
                  <Eyebrow>Reading material</Eyebrow>
                  <ResourceList
                    documents={resourceViews}
                    emptyText="The reading for this lesson hasn't been added yet."
                  />
                </section>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card bg-media px-6 text-center text-cream">
                  <span className="font-serif text-[28px] leading-[1.15]">
                    {lesson.kind === "video" ? "The video isn't ready yet" : "Nothing to watch in this lesson"}
                  </span>
                  <span className="max-w-[420px] text-small text-cream/70">
                    {lesson.kind === "video"
                      ? "It will play here once it has been uploaded and processed."
                      : `This is a ${lesson.kind} lesson. Its content arrives with a later update.`}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <Eyebrow>
                    {[index >= 0 ? `Lesson ${index + 1} of ${ordered.length}` : null, formatLessonLength(lesson.durationSec)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Eyebrow>
                  <h1 className="m-0 font-serif text-[30px] leading-[1.1] font-normal md:text-[38px]">{lesson.title}</h1>
                </div>
                <div className="flex gap-2.5">
                  {prev && (
                    <Button asChild variant="quiet" size="md">
                      <Link href={lessonHref(prev.id)}>
                        <Icon icon={ArrowLeft} size={16} />
                        Previous
                      </Link>
                    </Button>
                  )}
                  {next ? (
                    <Button asChild size="md">
                      <Link href={lessonHref(next.id)}>
                        Next lesson
                        <Icon icon={ArrowRight} size={16} strokeWidth={2} />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" size="md">
                      <Link href={`/courses/${courseId}`}>Back to course</Link>
                    </Button>
                  )}
                </div>
              </div>

              <Tabs defaultValue={studyNotes ? "study" : "notes"} className="flex flex-col">
                <TabsList aria-label="Lesson tools">
                  {studyNotes && <TabsTrigger value="study">Study notes</TabsTrigger>}
                  <TabsTrigger value="notes">{studyNotes ? "My notes" : "Notes"}</TabsTrigger>
                  {chapters.length > 0 && <TabsTrigger value="chapters" count={chapters.length}>Chapters</TabsTrigger>}
                  {deckCount.total > 0 && (
                    <TabsTrigger value="flashcards" count={deckCount.due || undefined}>
                      Flashcards
                    </TabsTrigger>
                  )}
                  {hasQuiz && <TabsTrigger value="quiz">Quiz</TabsTrigger>}
                  {showPodcast && <TabsTrigger value="podcast">Podcast</TabsTrigger>}
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  <TabsTrigger value="ask">Ask</TabsTrigger>
                  <TabsTrigger value="resources" count={resourceViews.length || undefined}>
                    Resources
                  </TabsTrigger>
                  <TabsTrigger value="discussion" count={data.discussionCount || undefined}>
                    Discussion
                  </TabsTrigger>
                </TabsList>
                {studyNotes && (
                  <TabsContent value="study">
                    <StudyNotes blocks={studyNotes} />
                  </TabsContent>
                )}
                <TabsContent value="notes">
                  <NotesTab
                    lessonId={lessonId}
                    initialNotes={notes.map((n) => ({ id: n.id, atSec: n.atSec, text: n.text }))}
                  />
                </TabsContent>
                {chapters.length > 0 && (
                  <TabsContent value="chapters">
                    <ChapterList chapters={chapters} />
                  </TabsContent>
                )}
                {deckCount.total > 0 && (
                  <TabsContent value="flashcards">
                    <Streamed>
                      <DeckPanel deck={deck} record={!preview} lessonId={lessonId} />
                    </Streamed>
                  </TabsContent>
                )}
                {hasQuiz && (
                  <TabsContent value="quiz">
                    <Streamed>
                      <QuizPanel data={quiz} target={{ courseId, lessonId }} preview={preview} />
                    </Streamed>
                  </TabsContent>
                )}
                {showPodcast && (
                  <TabsContent value="podcast">
                    <Streamed>
                      <PodcastPanel episodes={podcast} lessonId={lessonId} staff={preview} />
                    </Streamed>
                  </TabsContent>
                )}
                <TabsContent value="transcript">
                  <Streamed>
                    <TranscriptBody segments={segments} />
                  </Streamed>
                </TabsContent>
                <TabsContent value="ask">
                  <LazyAssistantChat
                    courseId={courseId}
                    courseCode={course.code}
                    courseTitle={course.title}
                    lessonId={lessonId}
                    lessonTitle={lesson.title}
                    initialThread={askThread && { id: askThread.id, turns: askThread.turns.map(toTurnView) }}
                    suggestions={chapters.slice(0, 4).map((c) => c.title)}
                  />
                </TabsContent>
                <TabsContent value="resources">
                  <ResourceList documents={resourceViews} />
                </TabsContent>
                <TabsContent value="discussion">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="m-0 text-small text-ink-soft">Questions about this lesson. Your instructor and classmates can reply.</p>
                      <NewDiscussionDialog
                        courses={[{ id: courseId, code: course.code, title: course.title }]}
                        lesson={{ id: lessonId, title: lesson.title }}
                        trigger={
                          <Button variant="secondary" size="sm" leading={<Icon icon={MessageCirclePlus} size={16} />}>
                            Ask a question
                          </Button>
                        }
                      />
                    </div>
                    <Card padded={false} className="overflow-hidden">
                      <Streamed>
                        <DiscussionPanel threads={threads} preview={preview} />
                      </Streamed>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </PlayerProvider>
        <CourseContents courseId={courseId} modules={modules} currentLessonId={lessonId} completed={completed} />
      </div>
    </>
  );
}

/* Started before the page renders and awaited inside a Suspense boundary.
   Marked as handled here, so a failure while the page is still rendering
   isn't an unhandled rejection; the panel that awaits it still throws. */
function early<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}

function Streamed({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <SkeletonRegion className="p-1">
          <SkeletonText lines={3} className="max-w-[560px]" />
        </SkeletonRegion>
      }
    >
      {children}
    </Suspense>
  );
}

async function TranscriptBody({ segments }: { segments: Promise<{ startSec: number; text: string }[]> }) {
  return <TranscriptPanel segments={await segments} />;
}

/* The cards' Markdown and maths are rendered here, on the server. */
async function DeckPanel({ deck, record, lessonId }: { deck: Promise<StudyQueue>; record: boolean; lessonId: string }) {
  const { cards, total, nextDueAt } = await deck;
  return <FlashcardDeck cards={renderCards(cards)} total={total} nextDueAt={nextDueAt} record={record} currentLessonId={lessonId} />;
}

async function QuizPanel({ data, target, preview }: { data: Promise<QuizTabData>; target: { courseId: string; lessonId: string }; preview: boolean }) {
  return <LazyQuizTab target={target} preview={preview} {...await data} />;
}

async function PodcastPanel({ episodes, lessonId, staff }: { episodes: Promise<PodcastEpisodes>; lessonId: string; staff: boolean }) {
  return <LazyPodcastTab target={{ lessonId }} staff={staff} episodes={await episodes} />;
}

async function DiscussionPanel({ threads, preview }: { threads: Promise<DiscussionSummary[]>; preview: boolean }) {
  return (
    <DiscussionList
      items={await threads}
      basePath={preview ? "/instructor/messages" : "/discussions"}
      waiting={preview}
      showCourse={false}
      empty={<EmptyState title="No questions yet" description="Stuck on something in this lesson? Ask, and you'll get a notification when someone replies." />}
    />
  );
}
