import { ArrowLeft, ArrowRight } from "lucide-react";
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
import { FocusHeader } from "@/components/shell/focus-header";
import { Badge, Button, EmptyState, Eyebrow, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { toTurnView } from "@/lib/ai/assistant";
import { requireAreaRole } from "@/lib/auth";
import { latestThread } from "@/lib/db/chat";
import { getCourseForUser, getLessonForUser } from "@/lib/db/courses";
import { completedLessonIds, getWatchProgress, listLessonNotes } from "@/lib/db/progress";
import { formatLessonLength } from "@/lib/utils/format";
import { getLessonPlayback } from "@/lib/video/lessons";
import { getPlayerNote, listChapters } from "@/lib/db/lesson-content";
import { StudyNotes } from "@/components/player/study-notes";

/* Lesson player (wireframe 05, features 11, 12 and 14 — the Ask tab). getLessonForUser is the gate:
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

  const [contents, playback, progress, notes, completed, chapters, studyNotes, askThread] = await Promise.all([
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
  ]);

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
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  <TabsTrigger value="ask">Ask</TabsTrigger>
                  <TabsTrigger value="resources">Resources</TabsTrigger>
                  <TabsTrigger value="discussion">Discussion</TabsTrigger>
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
                <TabsContent value="transcript">
                  <TranscriptPanel segments={playback?.segments ?? []} />
                </TabsContent>
                <TabsContent value="ask">
                  <AssistantChat
                    courseId={courseId}
                    courseTitle={course.title}
                    lessonId={lessonId}
                    lessonTitle={lesson.title}
                    initialThread={askThread && { id: askThread.id, turns: askThread.turns.map(toTurnView) }}
                    suggestions={chapters.slice(0, 4).map((c) => c.title)}
                  />
                </TabsContent>
                <TabsContent value="resources">
                  <EmptyState title="No resources yet" description="Slides, readings and files for this lesson will be listed here." />
                </TabsContent>
                <TabsContent value="discussion">
                  <EmptyState title="No discussion yet" description="Questions and replies about this lesson will appear here." />
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
