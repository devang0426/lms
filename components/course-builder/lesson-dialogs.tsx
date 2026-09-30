"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { changeLessonType, setLessonPublished } from "@/app/(instructor)/instructor/courses/actions";
import { Button, Dialog, DialogClose, DialogContent, Field, Select, toast } from "@/components/ui";
import {
  ADDABLE_LESSON_KINDS,
  goesLive,
  LESSON_KIND_LABELS,
  publishRefusal,
  TYPE_CHANGE_REFUSAL,
  type AddableLessonKind,
  type LessonFacts,
} from "@/lib/courses/lessons";
import type { Lesson } from "@/lib/db/schema";
import { useAction } from "./use-action";

type Row = Pick<Lesson, "id" | "title" | "kind" | "status">;

/* The row's Publish (feature 27, N2): says what goes live — the lesson and
   its drafted notes, flashcards and quiz, as the review screen's Publish
   does — or why it can't yet. */
export function PublishLessonDialog({
  courseId,
  lesson,
  facts,
  moduleDraft,
  open,
  onOpenChange,
}: {
  courseId: string;
  lesson: Row;
  facts: LessonFacts;
  moduleDraft: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pending, run } = useAction();
  const editor = `/instructor/courses/${courseId}/lessons/${lesson.id}`;
  const refusal = publishRefusal(lesson, facts.readyVideo);
  const items = goesLive(facts.drafts);
  const drafts = items.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={refusal ? `“${lesson.title}” can't be published yet` : `Publish “${lesson.title}”?`}
        description={
          refusal ??
          (moduleDraft ? "Its module is still a draft, so students see it once you publish the module too." : "Enrolled students can see it straight away.")
        }
      >
        {!refusal && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-small font-medium">Going live</p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-small">
              {items.map((item) => (
                <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</li>
              ))}
            </ul>
            {drafts && (
              <p className="m-0 text-meta text-ink-soft">
                These are AI drafts. <Link href={`${editor}/review`}>Review them first</Link> if you haven&apos;t.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button variant="quiet" size="md">
              {refusal ? "Close" : "Cancel"}
            </Button>
          </DialogClose>
          {refusal ? (
            lesson.status !== "processing" && (
              <Button asChild size="md">
                <Link href={editor}>Upload video</Link>
              </Button>
            )
          ) : (
            <Button
              size="md"
              loading={pending}
              onClick={() =>
                run(
                  () => setLessonPublished({ id: lesson.id, published: true }),
                  () => {
                    onOpenChange(false);
                    toast.success(drafts ? "Published, with its notes, flashcards and quiz." : "Published.");
                  },
                )
              }
            >
              Publish
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Change type (feature 27, V5): only while the lesson is empty. */
export function ChangeTypeDialog({
  lesson,
  facts,
  open,
  onOpenChange,
}: {
  lesson: Row;
  facts: LessonFacts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const selectId = useId();
  const { pending, run } = useAction();
  const others = ADDABLE_LESSON_KINDS.filter((k) => k !== lesson.kind);
  const [kind, setKind] = useState<AddableLessonKind>(others[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Change the type of “${lesson.title}”`}
        description={facts.empty ? `It's empty, so it can become another type. Now: ${LESSON_KIND_LABELS[lesson.kind]}.` : TYPE_CHANGE_REFUSAL}
      >
        {facts.empty && (
          <Field
            label="New type"
            htmlFor={selectId}
            hint={kind === "video" && lesson.status === "published" ? "It goes back to draft until its video is ready." : undefined}
          >
            <Select id={selectId} value={kind} onChange={(e) => setKind(e.target.value as AddableLessonKind)}>
              {others.map((k) => (
                <option key={k} value={k}>
                  {LESSON_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button variant="quiet" size="md">
              {facts.empty ? "Cancel" : "Close"}
            </Button>
          </DialogClose>
          {facts.empty && (
            <Button
              size="md"
              loading={pending}
              onClick={() =>
                run(
                  () => changeLessonType({ id: lesson.id, kind }),
                  () => {
                    onOpenChange(false);
                    toast.success(`Type changed to ${LESSON_KIND_LABELS[kind]}.`);
                  },
                )
              }
            >
              Change type
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
