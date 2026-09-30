"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { addNote, deleteNote, type NoteView } from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/actions";
import { Button, Icon, Textarea, toast } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { settle } from "@/lib/utils/action-result";
import { usePlayer } from "./player-context";

/* Timestamped personal notes (feature 11). The note is pinned to the
   moment the student started writing it; each saved note shows its
   "04:12" and clicking that seeks the video there. Notes are private. */
export function NotesTab({ lessonId, initialNotes }: { lessonId: string; initialNotes: NoteView[] }) {
  const { time, seek } = usePlayer();
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  // Frozen when typing starts, so the note keeps the moment it's about.
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const at = pinnedAt ?? time;

  const save = () => {
    const text = draft.trim();
    if (!text || saving) return;
    startSaving(async () => {
      const result = await settle(addNote({ lessonId, atSec: at, text }));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotes((list) => [...list, result.data].sort((a, b) => a.atSec - b.atSec));
      setDraft("");
      setPinnedAt(null);
      setError(null);
    });
  };

  const remove = async (id: string) => {
    const previous = notes;
    setNotes((list) => list.filter((n) => n.id !== id));
    const result = await settle(deleteNote(id));
    if (!result.ok) {
      setNotes(previous);
      toast.error(result.error.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="lesson-note" className="sr-only">
          Note at {formatTime(at)}
        </label>
        <Textarea
          id="lesson-note"
          rows={3}
          value={draft}
          maxLength={2000}
          placeholder={`Write a note at ${formatTime(at)}…`}
          invalid={Boolean(error)}
          onChange={(e) => {
            const value = e.target.value;
            if (!draft && value) setPinnedAt(time);
            if (!value) setPinnedAt(null);
            setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-meta text-ink-soft">
            {error ? (
              <span role="alert" className="text-terracotta">
                {error}
              </span>
            ) : pinnedAt !== null ? (
              <>Pinned to <span className="font-mono">{formatTime(pinnedAt)}</span> · Ctrl + Enter to save</>
            ) : (
              "Only you can see your notes."
            )}
          </span>
          <Button type="submit" variant="secondary" size="sm" loading={saving} disabled={!draft.trim()}>
            Save note
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="m-0 text-small text-ink-soft">No notes yet. Anything you write is pinned to the moment in the video.</p>
      ) : (
        <ul aria-label="Your notes" className="m-0 flex list-none flex-col p-0">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
              <button
                type="button"
                onClick={() => seek(n.atSec)}
                aria-label={`Play from ${formatTime(n.atSec)}`}
                className="mt-0.5 shrink-0 cursor-pointer rounded-full border-0 bg-clay px-2.5 py-0.5 font-mono text-meta text-clay-ink hover:bg-clay-stripe"
              >
                {formatTime(n.atSec)}
              </button>
              <p className="m-0 min-w-0 grow text-[15px] leading-[1.55] break-words whitespace-pre-wrap">{n.text}</p>
              <Button variant="icon" size="xs" aria-label="Delete note" onClick={() => remove(n.id)}>
                <Icon icon={Trash2} size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
