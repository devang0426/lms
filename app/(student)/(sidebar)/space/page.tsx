import { PageHeader } from "@/components/shell/page-header";
import { NewNoteDialog } from "@/components/space/new-note-dialog";
import { NoteCard } from "@/components/space/note-card";
import { Card, EmptyState } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { spaceNotes } from "@/lib/space";

export const metadata = { title: "My space · Studyhall" };

/* The student's private space (feature 19): notes made from their own
   files, web pages and videos, newest first, with a "New note" dialog.
   Only the owner ever sees any of it: every read is scoped to them in SQL
   (lib/db/space.ts), with no staff or admin override. */
export default async function MySpacePage() {
  const user = await requireAreaRole("student", "admin");
  const notes = await spaceNotes(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          eyebrow="My space"
          title={
            <>
              My <em>space</em>
            </>
          }
          actions={<NewNoteDialog />}
        />
        <p className="m-0 max-w-[640px] text-small text-ink-soft">
          Add your own PDFs, Word files, recordings, web pages or YouTube videos. Each one becomes notes, flashcards, a quiz, a
          chat and a podcast. Only you can see them: not your instructors, and not the university&rsquo;s admins.
        </p>
      </div>

      {notes.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="Nothing here yet"
            description="Start with something you're studying: slides from another class, a reading, a recorded talk. Press “New note” to add it."
          />
        </Card>
      ) : (
        <ul aria-label="Your notes" className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
