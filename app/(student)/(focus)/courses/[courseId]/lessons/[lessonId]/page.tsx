import { ArrowLeft, ArrowRight, MessageCirclePlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { ChapterList } from "@/components/player/chapter-list";
import { CourseContents } from "@/components/player/course-contents";
import { MarkCompleteButton } from "@/components/player/mark-complete-button";
import { NotesTab } from "@/components/player/notes-tab";
import { PlayerProvider } from "@/components/player/player-context";
import { TranscriptPanel } from "@/components/player/transcript-panel";
import { VideoPlayer, type PlayerChapter } from "@/components/player/video-player";
import { ResourceList } from "@/components/documents/resource-list";
import { FocusHeader } from "@/components/shell/focus-header";
import { Badge, Button, Card, EmptyState, Eyebrow, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { DiscussionList } from "@/components/discussions/discussion-list";
import { NewDiscussionDialog } from "@/components/discussions/new-discussion-dialog";
import { listDiscussions } from "@/lib/db/discussions";
import { toTurnView } from "@/lib/ai/assistant";
import { requireAreaRole } from "@/lib/auth";
import { latestThread } from "@/lib/db/chat";
import { getCourseForUser, getLessonForUser } from "@/lib/db/courses";
import { completedLessonIds, getWatchProgress, listLessonNotes } from "@/lib/db/progress";
import { formatLessonLength } from "@/lib/utils/format";
import { getLessonPlayback } from "@/lib/video/lessons";
import { getPlayerNote, listChapters } from "@/lib/db/lesson-content";
import { StudyNotes } from "@/components/player/study-notes";
import { FlashcardDeck } from "@/components/study/flashcard-deck";
import { PodcastTab } from "@/components/study/podcast-tab";
import { QuizTab } from "@/components/study/quiz-tab";
import { quizTabData } from "@/lib/db/quizzes";
import { previewCards, studyQueue } from "@/lib/db/study";
import { getPodcastTabs } from "@/lib/podcast";
import { lessonDocuments } from "@/lib/db/documents";
import type { DocumentView } from "@/lib/documents/view";
import { AssignmentPanel } from "@/components/coursework/assignment-panel";
import { getAssignment, studentWork } from "@/lib/db/assignments";
import { requestTime } from "@/lib/utils/clock";

/* Lesson player (wireframe 05, features 11, 12, 14 (Ask), 15 (Flashcards), 16 (Quiz), 17 (Podcast), 18 (Resources), 20 (assignments) and 21 (Discussion)). getLessonForUser is the gate:
   a student gets the lesson only when enrolled and the course, module and
   lesson are all published; anything else is a 404 before any video URL
   is loaded. Staff open the same page as a preview (drafts included, no
   progress recorded). */
export default async function LessonPlayerPage({ params }: PageProps<"/courses/[courseId]/lessons/[lessonId]">) {
  const { courseId, lessonId } = await params;
  const user = await requireAreaRole("student", "admin", "instructor");
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.course.id !== courseId) notFound();
  const { lesson, module, course } = found;
  const preview = found.access === "staff";

  const [contents, playback, progress, notes, completed, chapters, studyNotes, askThread, deck, quiz, podcast, resources, work, threads] = await Promise.all([
    getCourseForUser(courseId, user),
    lesson.kind === "video" ? getLessonPlayback(lessonId) : Promise.resolve(null),
    preview ? Promise.resolve(null) : getWatchProgress(user.id, lessonId),
    listLessonNotes(user.id, lessonId),
    preview ? Promise.resolve(new Set<string>()) : completedLessonIds(user.id, courseId),
    listChapters(lessonId) as Promise<PlayerChapter[]>,
    // Students get the notes only once the instructor has published them.
    getPlayerNote(lessonId, { publishedOnly: !preview }),
    // The assistant reopens the newest conversation about this lesson.
    latestThread({ userId: user.id, courseId, lessonId }),
    // Flashcards: the student's due cards; staff preview the whole deck unsaved.
    preview
      ? previewCards(lessonId).then((cards) => ({ cards, total: cards.length, nextDueAt: null }))
      : studyQueue(user.id, { lessonId }, 100),
    quizTabData(user.id, lessonId, preview),
    // Podcast: made from the published notes, only when someone asks.
    getPodcastTabs(lessonId, found.access),
    // Documents: students see ready ones; staff also see what's still being read.
    lessonDocuments(lessonId, { readyOnly: !preview }),
    // Assignment: the student's own work and returned grade; staff see the instructions.
    lesson.kind !== "assignment"
      ? Promise.resolve(null)
      : preview
        ? getAssignment(lessonId).then((assignment) => ({ assignment, submission: null, grade: null }))
        : studentWork(user.id, lessonId),
    // Discussion: the class's questions about this lesson (feature 21).
    listDiscussions(user, { lessonId, limit: 30 }),
  ]);
  const resourceViews: DocumentView[] = resources.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    status: d.status,
    pageCount: d.pageCount,
    durationSec: d.durationSec,
    sizeBytes: d.sizeBytes,
    hasFile: d.hasFile,
  }));
  const showPodcast = preview || Object.values(podcast).some((e) => e.hasSource || e.hasAudio);
  const hasQuiz = quiz.graded.length > 0 || Object.values(quiz.levelCounts).some((n) => n > 0);

  const modules = contents?.modules ?? [];
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
        <PlayerProvider key={lessonId} initialDuration={playback?.video.durationSec ?? lesson.durationSec ?? 0}>
          <main className="flex min-w-0 flex-1 flex-col gap-6 px-5 py-6 md:px-10 md:py-8">
            <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
              {playback ? (
                <VideoPlayer
                  lessonId={lessonId}
                  src={playback.video.blobUrl!}
                  poster={playback.video.posterUrl}
                  captionsUrl={playback.video.vttUrl}
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
                  {deck.total > 0 && (
                    <TabsTrigger value="flashcards" count={deck.cards.length || undefined}>
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
                  <TabsTrigger value="discussion" count={threads.length || undefined}>
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
                {deck.total > 0 && (
                  <TabsContent value="flashcards">
                    <FlashcardDeck
                      cards={deck.cards}
                      total={deck.total}
                      nextDueAt={deck.nextDueAt}
                      record={!preview}
                      currentLessonId={lessonId}
                    />
                  </TabsContent>
                )}
                {hasQuiz && (
                  <TabsContent value="quiz">
                    <QuizTab target={{ courseId, lessonId }} preview={preview} {...quiz} />
                  </TabsContent>
                )}
                {showPodcast && (
                  <TabsContent value="podcast">
                    <PodcastTab
                      target={{ lessonId }}
                      staff={preview}
                      episodes={podcast}
                    />
                  </TabsContent>
                )}
                <TabsContent value="transcript">
                  <TranscriptPanel segments={playback?.segments ?? []} />
                </TabsContent>
                <TabsContent value="ask">
                  <AssistantChat
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
                      <DiscussionList
                        items={threads}
                        basePath={preview ? "/instructor/messages" : "/discussions"}
                        waiting={preview}
                        showCourse={false}
                        empty={<EmptyState title="No questions yet" description="Stuck on something in this lesson? Ask, and you'll get a notification when someone replies." />}
                      />
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
