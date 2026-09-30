import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { FlashcardDeck } from "@/components/study/flashcard-deck";
import { renderCards } from "@/components/study/render-cards";
import { Chip } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isUuid } from "@/lib/db/courses";
import { loadStudyPage } from "@/lib/db/study";

export const metadata = { title: "Flashcards · Studyhall" };

const SESSION_LIMIT = 100;

/* Flashcards due today across the student's enrolled courses (feature 15),
   filtered by course in the URL (?course=). Everything is scoped to the
   student in SQL (lib/db/study.ts). */
export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const user = await requireAreaRole("student", "admin");
  const { course } = await searchParams;
  const courseId = typeof course === "string" && isUuid(course) ? course : undefined;

  // One batch; the sidebar notice reuses its due counts (feature 29).
  const { counts, queue } = await loadStudyPage(user.id, { courseId }, SESSION_LIMIT);
  const allDue = counts.reduce((sum, c) => sum + c.due, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Flashcards"
        title={
          allDue > 0 ? (
            <>
              <em>{allDue}</em> {allDue === 1 ? "card" : "cards"} due today
            </>
          ) : (
            <>
              Your <em>flashcards</em>
            </>
          )
        }
      />
      {counts.length > 1 && (
        <nav aria-label="Filter by course" className="flex flex-wrap gap-2">
          <Chip asChild active={!courseId}>
            <Link href="/study">All courses · {allDue}</Link>
          </Chip>
          {counts.map((c) => (
            <Chip key={c.courseId} asChild active={courseId === c.courseId}>
              <Link href={`/study?course=${c.courseId}`}>
                {c.code} · {c.due}
              </Link>
            </Chip>
          ))}
        </nav>
      )}
      <div className="w-full max-w-[760px]">
        <FlashcardDeck
          key={courseId ?? "all"}
          cards={renderCards(queue.cards)}
          total={queue.total}
          nextDueAt={queue.nextDueAt}
          showSource
          primary
        />
      </div>
    </div>
  );
}
