"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteNote } from "@/app/(student)/(sidebar)/space/[noteId]/actions";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Icon } from "@/components/ui";

/* Delete a private note (feature 19), after a confirm: the note goes with
   its cards, quiz, chat, podcast and uploaded file. */
export function DeleteNoteButton({ noteId, title }: { noteId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="icon" size="md" aria-label={`Delete “${title}”`}>
          <Icon icon={Trash2} size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete this note?" description="Its flashcards, quiz, chat and podcast go with it, and so does the file you uploaded. This can't be undone.">
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="quiet" size="md" disabled={pending}>
              Keep it
            </Button>
          </DialogClose>
          <Button
            variant="secondary"
            size="md"
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await deleteNote({ noteId });
                if (!res.ok) return setError(res.error.message);
                router.push("/space");
              })
            }
          >
            Delete note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
