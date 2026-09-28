"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveNote } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Icon, Input, Textarea, toast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatTime, parseT } from "@/lib/time";

/* Notes tab: a simple block editor. Each block is edited as its own
   Markdown (the server turns blocks to Markdown and back with
   blocksToMarkdown / markdownToBlocks). Headings can carry a video time,
   which becomes the "▶ 12:48" chip students use to jump into the video.
   Changes are saved together. */

export interface NoteItem {
  markdown: string;
  startSec: number | null;
  heading: boolean;
}

interface Row extends NoteItem {
  key: number;
  time: string;
}

let nextKey = 0;
const toRow = (item: NoteItem): Row => ({ ...item, key: nextKey++, time: item.startSec === null ? "" : formatTime(item.startSec) });

export function NotesEditor({ lessonId, items }: { lessonId: string; items: NoteItem[] }) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [dirty, setDirty] = useState(false);
  const { pending, run } = useAction();

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const patch = (i: number, fields: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...fields } : r)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    update(next);
  };

  const save = () => {
    const badTime = rows.find((r) => r.heading && r.time.trim() && parseT(r.time) === null);
    if (badTime) {
      toast.error("Write heading times as mm:ss, e.g. 12:48.");
      return;
    }
    const payload = rows
      .filter((r) => r.markdown.trim())
      .map((r) => ({ markdown: r.markdown, startSec: r.heading && r.time.trim() ? parseT(r.time) : null }));
    run(() => saveNote({ lessonId, items: payload }), () => {
      setDirty(false);
      toast.success("Notes saved.");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl bg-oat px-4 py-3">
        <span className="text-meta text-ink-soft">
          Each box is one block of Markdown. Start a line with <code className="font-mono">##</code> for a heading.
        </span>
        <Button size="sm" variant="secondary" loading={pending} disabled={!dirty} onClick={save}>
          {dirty ? "Save notes" : "Saved"}
        </Button>
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="group flex gap-2">
          <div className="flex min-w-0 grow flex-col gap-1.5">
            {r.heading && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">Video time</span>
                <Input
                  value={r.time}
                  onChange={(e) => patch(i, { time: e.target.value })}
                  placeholder="none"
                  aria-label="Video time for this heading"
                  className="h-8 w-24 font-mono text-meta"
                />
              </div>
            )}
            <Textarea
              value={r.markdown}
              rows={Math.min(12, Math.max(1, r.markdown.split("\n").length))}
              onChange={(e) => {
                const markdown = e.target.value;
                patch(i, { markdown, heading: /^#{1,6}\s/.test(markdown.trimStart()) });
              }}
              aria-label={`Block ${i + 1}`}
              className={cn("min-h-11 py-2.5 font-mono text-small", r.heading && "font-semibold")}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-1 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
            <Button size="xs" variant="icon" aria-label="Move block up" disabled={i === 0} onClick={() => move(i, -1)}>
              <Icon icon={ArrowUp} size={14} />
            </Button>
            <Button size="xs" variant="icon" aria-label="Move block down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
              <Icon icon={ArrowDown} size={14} />
            </Button>
            <Button
              size="xs"
              variant="icon"
              aria-label="Add a block below"
              onClick={() => update([...rows.slice(0, i + 1), toRow({ markdown: "", startSec: null, heading: false }), ...rows.slice(i + 1)])}
            >
              <Icon icon={Plus} size={14} />
            </Button>
            <Button size="xs" variant="icon" aria-label="Delete block" onClick={() => update(rows.filter((_, j) => j !== i))}>
              <Icon icon={Trash2} size={14} />
            </Button>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <Button variant="quiet" size="sm" onClick={() => update([toRow({ markdown: "", startSec: null, heading: false })])}>
          Add a block
        </Button>
      )}
    </div>
  );
}
