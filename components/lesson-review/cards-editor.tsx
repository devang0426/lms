"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createCard, removeCard, saveCard } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Badge, Button, Icon, Input, Textarea } from "@/components/ui";
import { RowActions, VideoTimeLink } from "./shared";

/* Flashcards tab: front, back and topic for each card. */

export interface CardItem {
  id: string;
  front: string;
  back: string;
  topic: string;
  startSec: number | null;
  published: boolean;
}

export function CardsEditor({ lessonId, cards, playerHref }: { lessonId: string; cards: CardItem[]; playerHref: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((c, i) => (
          <CardRow key={`${c.id}-${c.front}-${c.back}-${c.topic}`} lessonId={lessonId} card={c} index={i} playerHref={playerHref} />
        ))}
      </div>
      <NewCard lessonId={lessonId} />
    </div>
  );
}

function CardRow({ lessonId, card, index, playerHref }: { lessonId: string; card: CardItem; index: number; playerHref: string }) {
  const [draft, setDraft] = useState({ front: card.front, back: card.back, topic: card.topic });
  const { pending, run } = useAction();
  const dirty = draft.front !== card.front || draft.back !== card.back || draft.topic !== card.topic;
  const id = `card-${card.id}`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">Card {index + 1}</span>
        {!card.published && <Badge size="sm">Draft</Badge>}
        <span className="grow" />
        <VideoTimeLink href={playerHref} sec={card.startSec} />
      </div>
      <label htmlFor={`${id}-front`} className="sr-only">Front</label>
      <Textarea id={`${id}-front`} rows={2} value={draft.front} maxLength={500} onChange={(e) => setDraft({ ...draft, front: e.target.value })} className="font-medium" />
      <label htmlFor={`${id}-back`} className="sr-only">Back</label>
      <Textarea id={`${id}-back`} rows={3} value={draft.back} maxLength={1500} onChange={(e) => setDraft({ ...draft, back: e.target.value })} className="text-small" />
      <div className="flex items-center gap-3">
        <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} aria-label="Topic" placeholder="Topic" maxLength={80} className="h-9 max-w-[220px] text-small" />
        <span className="grow" />
        <RowActions
          dirty={dirty}
          pending={pending}
          label={`card ${index + 1}`}
          onSave={() => run(() => saveCard({ lessonId, id: card.id, ...draft }))}
          onDelete={() => run(() => removeCard({ lessonId, id: card.id }))}
        />
      </div>
    </div>
  );
}

function NewCard({ lessonId }: { lessonId: string }) {
  const empty = { front: "", back: "", topic: "" };
  const [draft, setDraft] = useState(empty);
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-line p-4 lg:max-w-[calc(50%-8px)]"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createCard({ lessonId, ...draft }), () => setDraft(empty));
      }}
    >
      <Textarea rows={2} value={draft.front} onChange={(e) => setDraft({ ...draft, front: e.target.value })} placeholder="Front: a question or term" aria-label="New card front" maxLength={500} />
      <Textarea rows={2} value={draft.back} onChange={(e) => setDraft({ ...draft, back: e.target.value })} placeholder="Back: the answer" aria-label="New card back" maxLength={1500} className="text-small" />
      <div className="flex items-center gap-3">
        <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic" aria-label="New card topic" maxLength={80} className="h-9 max-w-[220px] text-small" />
        <span className="grow" />
        <Button type="submit" size="xs" variant="quiet" loading={pending} disabled={!draft.front.trim() || !draft.back.trim()} leading={<Icon icon={Plus} size={14} />}>
          Add card
        </Button>
      </div>
    </form>
  );
}
