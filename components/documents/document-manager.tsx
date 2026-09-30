"use client";

import { FileText, Link2, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import {
  addDocumentLink,
  prepareDocumentUpload,
  removeDocument,
  retryDocument,
} from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/actions";
import { JobProgress, type JobSnapshot } from "@/components/jobs/job-progress";
import { useBlobUpload } from "@/components/uploads/use-blob-upload";
import { Badge, Button, Icon, Input, ProgressBar, type BadgeTone } from "@/components/ui";
import { DOCUMENT_STAGES } from "@/lib/jobs/stages";
import { documentMeta, KIND_LABELS, type DocumentView } from "@/lib/documents/view";
import { documentKindFor, documentTypeFromName } from "@/lib/storage/upload-kinds";
import { cn } from "@/lib/utils/cn";

/* The lesson editor's Documents card (feature 18): drop a PDF, Word file
   or recording (straight to Blob), or paste a web page or YouTube link.
   Each document shows its state; one being read shows live progress. */

export interface EditorDocumentView extends DocumentView {
  error: string | null;
  job: { runId: string; token: string; initial: JobSnapshot } | null;
}

const statusBadge: Record<DocumentView["status"], { tone: BadgeTone; label: string }> = {
  uploading: { tone: "neutral", label: "Uploading" },
  processing: { tone: "warning", label: "Reading" },
  ready: { tone: "success", label: "Ready" },
  failed: { tone: "new", label: "Failed" },
};

export function DocumentManager({
  lessonId,
  documents,
  reading,
  video,
}: {
  lessonId: string;
  documents: EditorDocumentView[];
  reading: boolean;
  /* A video lesson takes the lecture itself; any other points to one (feature 27). */
  video: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { state, start, reset } = useBlobUpload();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.phase === "done") {
      reset();
      router.refresh();
    }
  }, [state.phase, reset, router]);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    const type = file.type || documentTypeFromName(file.name);
    if (!documentKindFor(type)) return setError("Add a PDF, a Word document (.docx) or an audio recording (MP3, M4A, WAV).");
    const prepared = await prepareDocumentUpload({ lessonId, file: { name: file.name, size: file.size, type } });
    if (!prepared.ok) return setError(prepared.error.message);
    await start(new File([file], file.name, { type }), prepared.data.pathname, {
      kind: "lesson-document",
      lessonId,
      documentId: prepared.data.documentId,
    });
  }

  function addLink() {
    setError(null);
    startTransition(async () => {
      const res = await addDocumentLink({ lessonId, url: link });
      if (!res.ok) return setError(res.error.message);
      setLink("");
    });
  }

  function remove(documentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeDocument({ lessonId, documentId });
      if (!res.ok) setError(res.error.message);
    });
  }

  function retry(documentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await retryDocument({ lessonId, documentId });
      if (!res.ok) setError(res.error.message);
    });
  }

  const uploading = state.phase === "uploading";
  const shownError = error ?? (state.phase === "error" ? state.message : null);

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-small text-ink-soft">
        {reading
          ? "This reading lesson is drafted from its documents: notes, flashcards and a quiz are written from everything added here. The assistant cites them by page or section."
          : "Slides, readings and recordings for this lesson. Students find them under Resources, and the assistant cites them by page or section."}
      </p>

      {documents.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-3 border-b border-line py-3.5 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon icon={doc.kind === "url" || doc.kind === "youtube" ? Link2 : FileText} size={18} className="shrink-0 text-ink-soft" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium">{doc.title}</span>
                    <span className="text-meta text-ink-soft">{[KIND_LABELS[doc.kind], ...documentMeta(doc)].join(" · ")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusBadge[doc.status].tone} size="md">
                    {statusBadge[doc.status].label}
                  </Badge>
                  {doc.status === "failed" && (
                    <Button
                      size="xs"
                      variant="quiet"
                      leading={<Icon icon={RotateCcw} size={14} />}
                      disabled={pending}
                      onClick={() => retry(doc.id)}
                    >
                      Try again
                    </Button>
                  )}
                  <Button size="xs" variant="icon" aria-label={`Remove ${doc.title}`} disabled={pending} onClick={() => remove(doc.id)}>
                    <Icon icon={Trash2} size={14} />
                  </Button>
                </div>
              </div>
              {doc.status === "failed" && doc.error && !doc.job && (
                <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
                  {doc.error}
                </p>
              )}
              {doc.job && (
                <JobProgress
                  key={doc.job.runId}
                  runId={doc.job.runId}
                  accessToken={doc.job.token}
                  stages={DOCUMENT_STAGES}
                  title={`Reading “${doc.title}”`}
                  initial={doc.job.initial}
                  retry={() => retryDocument({ lessonId, documentId: doc.id })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-card border border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-terracotta bg-clay" : "border-line-strong bg-oat",
        )}
      >
        <Icon icon={Upload} size={24} className="text-ink-soft" />
        {uploading ? (
          <div className="flex w-full max-w-[360px] flex-col gap-2">
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
              aria-label="Choose a document"
              onChange={(e) => {
                void handle(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="md" onClick={() => input.current?.click()}>
              Choose a file
            </Button>
          </>
        )}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          addLink();
        }}
      >
        <label htmlFor={`doc-link-${lessonId}`} className="sr-only">
          Web page or YouTube link
        </label>
        <Input
          id={`doc-link-${lessonId}`}
          type="url"
          inputMode="url"
          placeholder="Paste a web page or YouTube link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button type="submit" variant="quiet" size="lg" loading={pending && link !== ""} disabled={!link.trim()} leading={<Icon icon={Link2} size={16} />}>
          Add link
        </Button>
      </form>
      <p className="m-0 text-meta text-ink-soft">
        {video
          ? "YouTube often blocks servers; if a video can't be read, upload the video or its audio instead."
          : "YouTube often blocks servers; if a video can't be read, upload its audio instead. For a lecture video, create a Video lesson."}
      </p>

      {shownError && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {shownError}
        </p>
      )}
    </div>
  );
}
