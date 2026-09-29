import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobProgress } from "@/components/jobs/job-progress";
import { StudyNotes } from "@/components/player/study-notes";
import { PageHeader } from "@/components/shell/page-header";
import { DeleteNoteButton } from "@/components/space/delete-note-button";
import { NoteExport } from "@/components/space/note-export";
import { SpaceChat } from "@/components/space/space-chat";
import { FlashcardDeck } from "@/components/study/flashcard-deck";
import { PodcastTab } from "@/components/study/podcast-tab";
import { QuizTab } from "@/components/study/quiz-tab";
import { Button, Card, EmptyState, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { toTurnView } from "@/lib/ai/assistant";
import { getCurrentUser, requireAreaRole } from "@/lib/auth";
import { latestThread } from "@/lib/db/chat";
import { noteQuizTabData } from "@/lib/db/quizzes";
import { noteStudyQueue } from "@/lib/db/study";
import { documentHref, documentMeta, KIND_LABELS } from "@/lib/documents/view";
import { DOCUMENT_STAGES } from "@/lib/jobs/stages";
import { getNotePodcastTabs } from "@/lib/podcast";
import { noteState, ownedNote } from "@/lib/space";
import { retryNote } from "./actions";

export async function generateMetadata({ params }: PageProps<"/space/[noteId]">): Promise<Metadata> {
  const { noteId } = await params;
  const user = await getCurrentUser();
  const note = user ? await ownedNote(noteId, user.id) : null;
  return { title: note ? `${note.title} · My space · Studyhall` : "My space · Studyhall" };
}

/* A private note (feature 19): its notes, flashcards, quiz, chat and
   podcast, from the lesson player's study components scoped to the note's
   owner. ownedNote is the gate: anyone but the owner (an instructor, an
   admin) gets a 404 before anything else about the note is read. While
   the note is being made, JobProgress follows the run and refreshes the
   page when it ends. */
export default async function NotePage({ params }: PageProps<"/space/[noteId]">) {
  const { noteId } = await params;
  const user = await requireAreaRole("student", "admin");
  const note = await ownedNote(noteId, user.id);
  if (!note) notFound();

  const [state, deck, quiz, podcast, thread] = await Promise.all([
    noteState(note),
    noteStudyQueue(user.id, note.id, 100),
    noteQuizTabData(user.id, note.id),
    getNotePodcastTabs(note.id, user.id),
    // The chat reopens the newest conversation about this note.
    latestThread({ userId: user.id, noteId: note.id }),
  ]);

  const source = note.source;
  const eyebrow = [
    source ? KIND_LABELS[source.kind] : "Note",
    ...(source ? documentMeta({ pageCount: source.pageCount, durationSec: source.durationSec, sizeBytes: null }) : []),
    `Added ${note.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
  ].join(" · ");
  const written = note.blocks.length > 0;
  const suggestions = note.blocks
    .filter((b) => b.type === "heading2")
    .map((b) => b.text.replace(/[*_`#$]/g, "").trim())
    .filter((t) => t && !/^key takeaways$/i.test(t))
    .slice(0, 4);
  const retry = retryNote.bind(null, note.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link href="/space" className="inline-flex items-center gap-1.5 self-start text-small text-ink-soft no-underline hover:text-ink">
          <Icon icon={ArrowLeft} size={16} />
          My space
        </Link>
        <PageHeader
          eyebrow={eyebrow}
          title={note.title}
          actions={
            <>
              {source && (source.hasFile || source.url) && (
                <Button asChild variant="quiet" size="md">
                  <a href={documentHref(source.id)} target="_blank" rel="noopener">
                    <Icon icon={ExternalLink} size={16} />
                    Original
                  </a>
                </Button>
              )}
              <NoteExport title={note.title} blocks={note.blocks} />
              <DeleteNoteButton noteId={note.id} title={note.title} />
            </>
          }
        />
      </div>

      {state.job ? (
        <JobProgress
          key={state.job.job.triggerRunId}
          runId={state.job.job.triggerRunId}
          accessToken={state.job.token}
          stages={DOCUMENT_STAGES}
          title={written ? "Finishing your note" : "Making your note"}
          initial={{
            status: state.job.job.status,
            stage: state.job.job.stage,
            progress: state.job.job.progress,
            message: state.job.job.message,
            error: state.job.job.error,
          }}
          retry={retry}
        />
      ) : state.phase === "failed" ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-clay px-4 py-3">
          <p role="alert" className="m-0 text-small text-clay-ink">
            {state.error ?? "This note couldn't be made."}
          </p>
          <form action={retry}>
            <Button type="submit" variant="secondary" size="sm" leading={<Icon icon={RotateCcw} size={16} />}>
              Try again
            </Button>
          </form>
        </div>
      ) : state.phase === "uploading" ? (
        <Card className="gap-1">
          <p className="m-0 text-[15px] font-medium">The upload didn&rsquo;t finish.</p>
          <p className="m-0 text-small text-ink-soft">Delete this note and add the file again from My space.</p>
        </Card>
      ) : null}

      <Tabs defaultValue="notes" className="flex flex-col">
        <TabsList aria-label="Study tools">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="flashcards" count={deck.cards.length || undefined}>
            Flashcards
          </TabsTrigger>
          <TabsTrigger value="quiz">Quiz</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="podcast">Podcast</TabsTrigger>
        </TabsList>
        <TabsContent value="notes">
          {written ? (
            <StudyNotes blocks={note.blocks} />
          ) : (
            <EmptyState
              title="Your notes aren't written yet"
              description={
                state.phase === "processing"
                  ? "They're being written from your source now. This page updates when they're ready."
                  : "They'll appear here once your source has been read."
              }
            />
          )}
        </TabsContent>
        <TabsContent value="flashcards">
          <div className="w-full max-w-[760px]">
            <FlashcardDeck
              cards={deck.cards}
              total={deck.total}
              nextDueAt={deck.nextDueAt}
              emptyText="Your flashcards appear here once your notes are written."
            />
          </div>
        </TabsContent>
        <TabsContent value="quiz">
          <QuizTab target={{ noteId: note.id }} preview={false} {...quiz} />
        </TabsContent>
        <TabsContent value="chat">
          <SpaceChat
            noteId={note.id}
            initialThread={thread && { id: thread.id, turns: thread.turns.map(toTurnView) }}
            suggestions={suggestions}
          />
        </TabsContent>
        <TabsContent value="podcast">
          <PodcastTab
            target={{ noteId: note.id }}
            staff={false}
            episodes={podcast}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
