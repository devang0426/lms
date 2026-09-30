"use client";

import { Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { prepareVideoUpload } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/actions";
import { Button, Icon, ProgressBar } from "@/components/ui";
import { useBlobUpload, type UploadState } from "@/components/uploads/use-blob-upload";
import { formatBytes } from "@/lib/documents/view";
import { cn } from "@/lib/utils/cn";
import type { ActionResult } from "@/lib/utils/action-result";
import { VIDEO_REQUIREMENTS, videoFileProblem, type VideoFileInfo } from "@/lib/video/upload-check";

export interface PreparedVideo {
  lessonId: string;
  videoId: string;
  pathname: string;
}

/* A lecture upload (feature 10): check the file (the same check the server
   makes, feature 27), let `prepare` make the rows, then send it straight
   to Blob in parts. The lesson editor prepares on an existing lesson; the
   builder's "Upload lecture" dialog makes the lesson too. */
export function useVideoUpload() {
  const { state, start, reset } = useBlobUpload();
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  function check(file: File): boolean {
    const problem = videoFileProblem(info(file));
    setError(problem);
    return problem === null;
  }

  /* Null when it stopped before uploading (the error is set); otherwise the
     prepared rows and how the upload ended. */
  async function upload(
    file: File,
    prepare: (file: VideoFileInfo) => Promise<ActionResult<PreparedVideo>>,
  ): Promise<{ prepared: PreparedVideo; final: UploadState } | null> {
    if (!check(file)) return null;
    setPreparing(true);
    const prepared = await prepare(info(file)).catch(() => null);
    setPreparing(false);
    if (!prepared?.ok) {
      setError(prepared ? prepared.error.message : "Something went wrong. Try again in a moment.");
      return null;
    }
    const { lessonId, videoId, pathname } = prepared.data;
    // Blob takes only video/mp4; the browser may have called the file
    // something else, or nothing (V6). ffprobe checks the real codecs.
    const final = await start(new File([file], file.name, { type: "video/mp4" }), pathname, { kind: "lesson-video", lessonId, videoId });
    return { prepared: prepared.data, final };
  }

  return {
    state,
    preparing,
    busy: preparing || state.phase === "uploading",
    error: error ?? (state.phase === "error" ? state.message : null),
    check,
    upload,
    reset: () => {
      reset();
      setError(null);
    },
  };
}

function info(file: File): VideoFileInfo {
  return { name: file.name, size: file.size, type: file.type };
}

/* The dashed drop zone: a file picker (and drop target) while idle, the
   upload's progress while it runs. */
export function VideoDropZone({
  state,
  busy,
  preparing,
  heading,
  buttonLabel,
  chosen,
  onFile,
}: {
  state: UploadState;
  busy: boolean;
  preparing: boolean;
  heading: string;
  buttonLabel: string;
  /* A file picked but not sent yet (the upload dialog). */
  chosen?: File | null;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={busy ? (e) => e.preventDefault() : onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-terracotta bg-clay" : "border-line-strong bg-oat",
      )}
    >
      <Icon icon={Film} size={26} className="text-ink-soft" />
      {state.phase === "uploading" ? (
        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <span className="text-small">Uploading… {state.percent}%</span>
          <ProgressBar value={state.percent} label="Upload progress" />
          <span className="text-meta text-ink-soft">Keep this tab open until the upload finishes. Processing carries on without it.</span>
        </div>
      ) : state.phase === "done" ? (
        <span className="text-small">Uploaded. Starting processing…</span>
      ) : (
        <>
          {chosen ? (
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium break-all">{chosen.name}</span>
              <span className="text-meta text-ink-soft">{formatBytes(chosen.size)}</span>
            </span>
          ) : (
            <span className="text-[15px] font-medium">{heading}</span>
          )}
          <span className="text-meta text-ink-soft">{VIDEO_REQUIREMENTS}</span>
          <input
            ref={input}
            type="file"
            accept="video/mp4,.mp4"
            className="sr-only"
            aria-label="Choose a video file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="md" loading={preparing} disabled={busy} onClick={() => input.current?.click()}>
            {chosen ? "Choose another video" : buttonLabel}
          </Button>
        </>
      )}
    </div>
  );
}

/* "Upload video" on a video lesson's editor (feature 10). The page then
   shows processing progress. */
export function VideoUploader({ lessonId, replacing }: { lessonId: string; replacing: boolean }) {
  const router = useRouter();
  const video = useVideoUpload();

  // An error refreshes too: an upload whose processing couldn't start
  // leaves a failed video, and the page then offers Retry (feature 26).
  useEffect(() => {
    if (video.state.phase === "done" || video.state.phase === "error") router.refresh();
  }, [video.state.phase, router]);

  return (
    <div className="flex flex-col gap-3">
      <VideoDropZone
        state={video.state}
        busy={video.busy}
        preparing={video.preparing}
        heading={replacing ? "Drop a new MP4 to replace this video" : "Drop the lecture MP4 here"}
        buttonLabel={replacing ? "Choose a new video" : "Choose a video"}
        onFile={(file) => void video.upload(file, (f) => prepareVideoUpload({ lessonId, file: f }))}
      />
      {video.error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {video.error}
        </p>
      )}
    </div>
  );
}
