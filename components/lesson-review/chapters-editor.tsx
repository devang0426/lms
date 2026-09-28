"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createChapter, removeChapter, saveChapter } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Icon, Input } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { VideoTimeLink } from "./shared";

/* Chapters tab: edit each chapter's time, title and summary in place. */

export interface ChapterItem {
  id: string;
  title: string;
  startSec: number;
  summary: string;
}

export function ChaptersEditor({ lessonId, chapters, playerHref }: { lessonId: string; chapters: ChapterItem[]; playerHref: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[96px_1fr_1.4fr_auto] gap-3 px-4 font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase md:grid">
        <span>Starts</span>
        <span>Title</span>
        <span>Summary</span>
        <span className="w-[88px]" />
      </div>
      {chapters.map((c) => (
        <ChapterRow key={`${c.id}-${c.startSec}-${c.title}`} lessonId={lessonId} chapter={c} playerHref={playerHref} />
      ))}
      <NewChapter lessonId={lessonId} />
    </div>
  );
}

function ChapterRow({ lessonId, chapter, playerHref }: { lessonId: string; chapter: ChapterItem; playerHref: string }) {
  const initial = { start: formatTime(chapter.startSec), title: chapter.title, summary: chapter.summary };
  const [draft, setDraft] = useState(initial);
  const { pending, run } = useAction();
  const dirty = draft.start !== initial.start || draft.title !== initial.title || draft.summary !== initial.summary;

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-paper p-4 md:grid-cols-[96px_1fr_1.4fr_auto] md:items-center">
      <div className="flex items-center gap-2">
        <Input
          value={draft.start}
          onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          aria-label={`Start time of ${chapter.title}`}
          className="h-10 font-mono text-small"
        />
      </div>
      <Input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        aria-label="Chapter title"
        maxLength={120}
        className="h-10"
      />
      <Input
        value={draft.summary}
        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        aria-label={`Summary of ${chapter.title}`}
        maxLength={600}
        className="h-10 text-small"
      />
      <div className="flex items-center justify-end gap-2">
        <VideoTimeLink href={playerHref} sec={chapter.startSec} />
        {dirty ? (
          <Button size="xs" variant="secondary" loading={pending} onClick={() => run(() => saveChapter({ lessonId, id: chapter.id, ...draft }))}>
            Save
          </Button>
        ) : (
          <Button
            size="xs"
            variant="quiet"
            disabled={pending}
            aria-label={`Delete chapter ${chapter.title}`}
            onClick={() => run(() => removeChapter({ lessonId, id: chapter.id }))}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function NewChapter({ lessonId }: { lessonId: string }) {
  const empty = { start: "", title: "", summary: "" };
  const [draft, setDraft] = useState(empty);
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-3 rounded-2xl border border-dashed border-line p-4 md:grid-cols-[96px_1fr_1.4fr_auto] md:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createChapter({ lessonId, ...draft }), () => setDraft(empty));
      }}
    >
      <Input value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} placeholder="mm:ss" aria-label="Start time of new chapter" className="h-10 font-mono text-small" />
      <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="New chapter title" aria-label="New chapter title" maxLength={120} className="h-10" />
      <Input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="One-sentence summary" aria-label="New chapter summary" maxLength={600} className="h-10 text-small" />
      <Button type="submit" size="xs" variant="quiet" loading={pending} disabled={!draft.title.trim() || !draft.start.trim()} leading={<Icon icon={Plus} size={14} />}>
        Add
      </Button>
    </form>
  );
}
