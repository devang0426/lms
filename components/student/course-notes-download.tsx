"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogTrigger, Icon, toast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/* Download a course's lesson notes as one file (feature 36). The student
   picks lessons (all ticked to start) and a format; the file is built by
   /courses/[courseId]/notes/export. Markdown and Word download in place;
   PDF opens a print page in a new tab, where the browser saves it. */

export interface NotesModule {
  id: string;
  title: string;
  lessons: { id: string; number: number; title: string }[];
}

type Format = "md" | "doc" | "print";

const formats: { value: Format; label: string; hint: string }[] = [
  { value: "print", label: "PDF", hint: "Opens the print dialog; choose Save as PDF" },
  { value: "doc", label: "Word", hint: ".doc, opens in Word or Google Docs" },
  { value: "md", label: "Markdown", hint: ".md, plain text with formatting" },
];

function fileNameFrom(res: Response, fallback: string): string {
  return /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallback;
}

export function CourseNotesDownload({ courseId, modules }: { courseId: string; modules: NotesModule[] }) {
  const all = modules.flatMap((m) => m.lessons.map((l) => l.id));
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all));
  const [format, setFormat] = useState<Format>("print");
  const [pending, setPending] = useState(false);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function download() {
    // Every lesson picked: leave the list out, so the link stays short.
    const ids = all.filter((id) => picked.has(id));
    const query = new URLSearchParams({ format });
    if (ids.length < all.length) query.set("lessons", ids.join(","));
    const url = `/courses/${courseId}/notes/export?${query}`;

    if (format === "print") {
      if (!window.open(url, "_blank")) toast.error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      else setOpen(false);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileNameFrom(res, `notes.${format}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setOpen(false);
    } catch {
      toast.error("The notes couldn't be downloaded. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="quiet" size="sm" leading={<Icon icon={Download} size={16} />}>
          Download notes
        </Button>
      </DialogTrigger>
      <DialogContent title="Download notes" description="Pick the lessons to put in one file, in course order.">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void download();
          }}
        >
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-1.5 flex w-full items-baseline justify-between gap-3 p-0 text-meta font-medium">
              Lessons
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-meta text-terracotta underline underline-offset-4 hover:text-terracotta-hover"
                onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all))}
              >
                {picked.size === all.length ? "Clear all" : "Select all"}
              </button>
            </legend>
            {modules.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <span className="text-meta text-ink-soft">{m.title}</span>
                {m.lessons.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-start gap-2.5 text-small">
                    <input
                      type="checkbox"
                      checked={picked.has(l.id)}
                      onChange={() => toggle(l.id)}
                      className="mt-0.5 size-4 shrink-0 accent-terracotta"
                    />
                    <span>
                      <span className="text-ink-soft">Lesson {l.number} · </span>
                      {l.title}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 text-meta font-medium">Format</legend>
            {formats.map((f) => (
              <label
                key={f.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-tile border px-3.5 py-2.5 text-small",
                  format === f.value ? "border-ink" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="notes-format"
                  value={f.value}
                  checked={format === f.value}
                  onChange={() => setFormat(f.value)}
                  className="mt-0.5 size-4 shrink-0 accent-terracotta"
                />
                <span className="flex flex-col gap-0.5">
                  {f.label}
                  <span className="text-meta text-ink-soft">{f.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={picked.size === 0}>
              {format === "print" ? "Open PDF" : "Download"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
