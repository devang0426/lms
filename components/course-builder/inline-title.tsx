"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Icon, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/* A title with a rename button. Enter saves, Escape cancels. */
export function InlineTitle({
  value,
  label,
  onSave,
  pending,
  className,
}: {
  value: string;
  label: string;
  onSave: (title: string, done: () => void) => void;
  pending: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || title === value) return setEditing(false);
    onSave(title, () => setEditing(false));
  }

  if (!editing) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <span className="truncate">{value}</span>
        <Button
          variant="icon"
          size="xs"
          className="border-transparent bg-transparent text-ink-soft"
          aria-label={`Rename ${label}`}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <Icon icon={Pencil} size={14} />
        </Button>
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 grow items-center gap-1.5">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        aria-label={`New name for ${label}`}
        maxLength={200}
        className="h-9 min-w-0 text-[15px]"
      />
      <Button type="submit" variant="icon" size="xs" aria-label="Save name" loading={pending}>
        <Icon icon={Check} size={14} />
      </Button>
      <Button variant="icon" size="xs" aria-label="Cancel rename" onClick={() => setEditing(false)}>
        <Icon icon={X} size={14} />
      </Button>
    </form>
  );
}
