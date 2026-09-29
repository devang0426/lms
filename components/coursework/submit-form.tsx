"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { handInAssignment } from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/assignment-actions";
import { useBlobUpload } from "@/components/uploads/use-blob-upload";
import { Button, Field, Icon, ProgressBar, Textarea, toast } from "@/components/ui";
import { formatBytes } from "@/lib/documents/view";
import { blobPaths, MAX_SUBMISSION_FILES, SUBMISSION_TYPES, UPLOAD_KINDS } from "@/lib/storage/upload-kinds";
import type { SubmittedFileView } from "./submitted-work";

/* The hand-in form on an assignment lesson (feature 20). Each file goes
   straight to Blob as soon as it's picked (with progress); "Hand in" then
   sends the answer plus refs to those uploads, and the server checks each
   one. Replacing a submission keeps the files left in the list. */

const EXT_TYPES: Record<string, (typeof SUBMISSION_TYPES)[number]> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
};

function typeOf(file: File): string {
  if (file.type) return file.type;
  return EXT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

interface AddedFile {
  url: string;
  pathname: string;
  name: string;
  size: number;
}

export function SubmitForm({
  lessonId,
  assignmentId,
  userId,
  initialText,
  currentFiles,
  late,
  resubmitting,
}: {
  lessonId: string;
  assignmentId: string;
  userId: string;
  initialText: string;
  currentFiles: SubmittedFileView[];
  /* Handing in now would be flagged late (the server decides for real). */
  late: boolean;
  resubmitting: boolean;
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const { state, start } = useBlobUpload();
  const [text, setText] = useState(initialText);
  const [keep, setKeep] = useState<number[]>(() => currentFiles.map((_, i) => i));
  const [added, setAdded] = useState<AddedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const count = keep.length + added.length;
  const maxMb = Math.round(UPLOAD_KINDS["submission-file"].maxBytes / 1024 / 1024);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    let room = MAX_SUBMISSION_FILES - count;
    for (const file of Array.from(list)) {
      if (room <= 0) {
        setError(`Attach ${MAX_SUBMISSION_FILES} files at most.`);
        break;
      }
      const type = typeOf(file);
      if (!(SUBMISSION_TYPES as readonly string[]).includes(type)) {
        setError(`${file.name}: add a PDF, Word document (.docx), PNG or JPEG image, or a text file.`);
        continue;
      }
      const res = await start(new File([file], file.name, { type }), blobPaths.submission(assignmentId, userId, file.name), {
        kind: "submission-file",
        assignmentId,
      });
      if (res.phase === "done") {
        setAdded((a) => [...a, { url: res.url, pathname: res.pathname, name: file.name, size: res.size }]);
        room -= 1;
      } else if (res.phase === "error") {
        setError(`${file.name}: ${res.message}`);
      }
    }
    setBusy(false);
  }

  function submit() {
    setError(null);
    startSaving(async () => {
      const res = await handInAssignment({
        lessonId,
        assignmentId,
        text,
        keep,
        files: added.map(({ url, pathname, name }) => ({ url, pathname, name })),
      });
      if (!res.ok) return setError(res.error.message);
      toast.success(res.data.late ? "Handed in. It's marked late." : "Handed in. Your instructor will see it in their queue.");
      router.refresh();
    });
  }

  const uploading = busy && state.phase === "uploading";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Your answer" htmlFor={`answer-${assignmentId}`} hint="Optional if you attach files.">
        <Textarea
          id={`answer-${assignmentId}`}
          value={text}
          maxLength={20_000}
          rows={8}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your answer here…"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-meta font-medium">Files</span>
        {count > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {keep.map((i) => (
              <FileRow key={`keep-${i}`} name={currentFiles[i].name} size={currentFiles[i].size} onRemove={() => setKeep((k) => k.filter((x) => x !== i))} />
            ))}
            {added.map((f) => (
              <FileRow key={f.pathname} name={f.name} size={f.size} onRemove={() => setAdded((a) => a.filter((x) => x.pathname !== f.pathname))} />
            ))}
          </ul>
        )}
        {uploading && (
          <div className="flex max-w-[360px] flex-col gap-1.5">
            <span className="text-meta text-ink-soft">Uploading… {state.percent}%</span>
            <ProgressBar value={state.percent} label="Upload progress" />
          </div>
        )}
        <input
          ref={picker}
          type="file"
          multiple
          accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
          className="sr-only"
          aria-label="Choose files to hand in"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="quiet"
            size="sm"
            leading={<Icon icon={Paperclip} size={16} />}
            disabled={busy || count >= MAX_SUBMISSION_FILES}
            onClick={() => picker.current?.click()}
          >
            Attach files
          </Button>
          <span className="text-meta text-ink-soft">
            PDF · DOCX · PNG or JPEG · TXT · up to {MAX_SUBMISSION_FILES} files, {maxMb} MB each
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-meta text-ink-soft">
          {late
            ? "The due date has passed, so this will be marked late."
            : resubmitting
              ? "Handing in again replaces what you handed in before. You can change it until it's graded."
              : "You can change your work until it's graded."}
        </span>
        <Button type="submit" variant="secondary" size="md" loading={saving} disabled={busy || (count === 0 && text.trim() === "")}>
          {resubmitting ? "Hand in again" : "Hand in"}
        </Button>
      </div>
    </form>
  );
}

function FileRow({ name, size, onRemove }: { name: string; size: number; onRemove: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2.5 text-[15px]">
        <Icon icon={FileText} size={16} className="shrink-0 text-ink-soft" />
        <span className="truncate">{name}</span>
        <span className="shrink-0 text-meta text-ink-soft">{formatBytes(size)}</span>
      </span>
      <Button variant="icon" size="xs" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Icon icon={X} size={14} />
      </Button>
    </li>
  );
}
