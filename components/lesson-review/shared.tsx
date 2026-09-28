"use client";

import { Play, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { publishLesson, regenerate } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Icon, toast } from "@/components/ui";
import { formatTime } from "@/lib/time";

/* Pieces shared by the review tabs (feature 12). */

export type ContentKind = "chapters" | "notes" | "cards" | "quiz";

const kindLabels: Record<ContentKind, string> = {
  chapters: "chapters",
  notes: "notes",
  cards: "flashcards",
  quiz: "quiz questions",
};

/* "▶ 04:12", opening the student player at that moment (staff preview). */
export function VideoTimeLink({ href, sec }: { href: string; sec: number | null }) {
  if (sec === null) return null;
  return (
    <Link
      href={`${href}?t=${Math.floor(sec)}`}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-clay px-2 font-mono text-[12px] text-clay-ink no-underline hover:bg-clay-stripe hover:text-clay-ink"
      aria-label={`Watch from ${formatTime(sec)}`}
    >
      <Icon icon={Play} size={10} fill="currentColor" />
      {formatTime(sec)}
    </Link>
  );
}

/* Save / Delete for one row. Save only shows while there are changes. */
export function RowActions({
  dirty,
  pending,
  onSave,
  onDelete,
  label,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {dirty && (
        <Button size="xs" variant="secondary" loading={pending} onClick={onSave}>
          Save
        </Button>
      )}
      <Button size="xs" variant="icon" aria-label={`Delete ${label}`} disabled={pending} onClick={onDelete}>
        <Icon icon={Trash2} size={14} />
      </Button>
    </div>
  );
}

/* Redraft one tab. Confirms first: it replaces the tab, edits included. */
export function RegenerateButton({ lessonId, kind, disabled }: { lessonId: string; kind: ContentKind; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="quiet" size="sm" disabled={disabled} leading={<Icon icon={RefreshCw} size={16} />}>
          Regenerate
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Redraft the ${kindLabels[kind]}?`}
        description={`The AI writes a fresh draft from the transcript. It replaces the current ${kindLabels[kind]}, including your edits, and they stay drafts until you publish.`}
      >
        <div className="flex justify-end gap-2.5">
          <DialogClose asChild>
            <Button variant="quiet" size="md">
              Keep these
            </Button>
          </DialogClose>
          <Button
            variant="secondary"
            size="md"
            loading={pending}
            onClick={() =>
              run(() => regenerate({ lessonId, kind }), () => {
                setOpen(false);
                toast.success(`Redrafting the ${kindLabels[kind]}. This takes a minute or two.`);
              })
            }
          >
            Redraft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Publish the lesson and everything generated for it. */
export function PublishButton({ lessonId, drafts, published }: { lessonId: string; drafts: number; published: boolean }) {
  const { pending, run } = useAction();
  const upToDate = published && drafts === 0;
  return (
    <Button
      size="md"
      loading={pending}
      disabled={upToDate}
      leading={<Icon icon={Send} size={16} />}
      onClick={() =>
        run(() => publishLesson({ lessonId }), () => toast.success("Published. Enrolled students can see this lesson now."))
      }
    >
      {upToDate ? "Published" : published ? "Publish changes" : "Publish lesson"}
    </Button>
  );
}
