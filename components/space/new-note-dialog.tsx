"use client";

import { Link2, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { createNoteFromLink, discardUnfinishedUpload, prepareNoteUpload } from "@/app/(student)/(sidebar)/space/actions";
import { useBlobUpload } from "@/components/uploads/use-blob-upload";
import { Button, ChipGroup, Dialog, DialogContent, DialogTrigger, Icon, Input, ProgressBar } from "@/components/ui";
import { documentKindFor, documentTypeFromName } from "@/lib/storage/upload-kinds";
import { cn } from "@/lib/utils/cn";

/* "New note" in the private space (feature 19). File: a PDF, Word file or
   recording goes straight from the browser to Blob, into the student's own
   folder; Link: a web page; YouTube: a video. Once the source is in, the
   note opens and shows its progress while the notes, cards and quiz are
   written. The dialog is the page's one Terracotta action. */

type Source = "file" | "link" | "youtube";

const SOURCES: { value: Source; label: string }[] = [
  { value: "file", label: "File" },
  { value: "link", label: "Link" },
  { value: "youtube", label: "YouTube" },
];

export function NewNoteDialog() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { state, start, reset } = useBlobUpload();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("file");
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploading = state.phase === "uploading";
  const busy = working || uploading;

  async function addFile(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    reset();
    const type = file.type || documentTypeFromName(file.name);
    if (!documentKindFor(type)) return setError("Add a PDF, a Word document (.docx) or an audio recording (MP3, M4A, WAV).");
    setWorking(true);
    try {
      const prepared = await prepareNoteUpload({ file: { name: file.name, size: file.size, type } });
      if (!prepared.ok) return setError(prepared.error.message);
      const result = await start(new File([file], file.name, { type }), prepared.data.pathname, {
        kind: "private-document",
        documentId: prepared.data.documentId,
      });
      if (result.phase === "done") return router.push(`/space/${prepared.data.noteId}`);
      // The upload didn't finish: its empty note goes, so nothing is left half-made.
      await discardUnfinishedUpload({ noteId: prepared.data.noteId });
    } finally {
      setWorking(false);
    }
  }

  async function addLink() {
    if (busy) return;
    setError(null);
    setWorking(true);
    try {
      const res = await createNoteFromLink({ url: link, source: source === "youtube" ? "youtube" : "link" });
      if (!res.ok) return setError(res.error.message);
      router.push(`/space/${res.data.noteId}`);
    } finally {
      setWorking(false);
    }
  }

  const shownError = error ?? (state.phase === "error" ? state.message : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // an upload in flight finishes first
        setOpen(next);
        if (!next) {
          setError(null);
          setLink("");
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button leading={<Icon icon={Plus} size={18} />}>New note</Button>
      </DialogTrigger>
      <DialogContent
        title="New note"
        description="Notes, flashcards, a quiz, a chat and a podcast, made from your own material. Only you can see them."
      >
        <ChipGroup
          label="Make it from"
          value={source}
          onValueChange={(v) => {
            if (busy) return;
            setSource(v as Source);
            setError(null);
          }}
          options={SOURCES}
        />

        {source === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              void addFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-card border border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-terracotta bg-clay" : "border-line-strong bg-oat",
            )}
          >
            <Icon icon={Upload} size={24} className="text-ink-soft" />
            {uploading ? (
              <div className="flex w-full max-w-[320px] flex-col gap-2">
                <span className="text-small">Uploading… {state.percent}%</span>
                <ProgressBar value={state.percent} label="Upload progress" />
              </div>
            ) : (
              <>
                <span className="text-[15px] font-medium">Drop a PDF, Word document or recording</span>
                <span className="text-meta text-ink-soft">PDF · DOCX · MP3, M4A or WAV · up to 200 MB</span>
                <input
                  ref={input}
                  type="file"
                  accept=".pdf,.docx,.mp3,.m4a,.wav,.ogg,.webm,application/pdf,audio/*"
                  className="sr-only"
                  aria-label="Choose a file"
                  onChange={(e) => {
                    void addFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button variant="secondary" size="md" loading={working} onClick={() => input.current?.click()}>
                  Choose a file
                </Button>
              </>
            )}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void addLink();
            }}
          >
            <label htmlFor="new-note-link" className="text-meta font-medium">
              {source === "youtube" ? "YouTube link" : "Web page link"}
            </label>
            <Input
              id="new-note-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder={source === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://…"}
              value={link}
              invalid={Boolean(shownError)}
              onChange={(e) => setLink(e.target.value)}
            />
            <p className="m-0 text-meta text-ink-soft">
              {source === "youtube"
                ? "The video's captions are used, or its sound is transcribed. YouTube often blocks servers; if it does, upload the recording instead."
                : "The page's main text is read, like a reading. Pages behind a sign-in can't be read."}
            </p>
            <Button type="submit" loading={working} disabled={!link.trim()} leading={<Icon icon={Link2} size={16} />} className="self-start">
              Make note
            </Button>
          </form>
        )}

        {shownError && (
          <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
            {shownError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
