"use client";

import { Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { prepareVideoUpload } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/actions";
import { Button, Icon, ProgressBar } from "@/components/ui";
import { useBlobUpload } from "@/components/uploads/use-blob-upload";
import { cn } from "@/lib/utils/cn";

const EXPORT_HINT = "Please export as MP4 (H.264) — in most editors that's the default 'MP4' preset.";

/* Checks we can make before sending a byte. The server re-checks the real
   codecs with ffprobe (HEVC can hide inside an .mp4). */
function precheck(file: File): string | null {
  const name = file.name.toLowerCase();
  if (file.type === "video/quicktime" || name.endsWith(".mov")) return `This is a QuickTime (.mov) file. ${EXPORT_HINT}`;
  if (file.type !== "video/mp4" && !name.endsWith(".mp4")) return `This isn't an MP4 file. ${EXPORT_HINT}`;
  if (file.size > 2048 * 1024 * 1024) return "This video is over 2 GB. Export it at 720p or a lower bitrate.";
  return null;
}

/* "Upload video" drop zone for a video lesson (feature 10). The file goes
   straight to Blob in parts; the page then shows processing progress. */
export function VideoUploader({ lessonId, replacing }: { lessonId: string; replacing: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { state, start } = useBlobUpload();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (state.phase === "done") router.refresh();
  }, [state.phase, router]);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    const problem = precheck(file);
    if (problem) return setError(problem);

    setPreparing(true);
    const prepared = await prepareVideoUpload({
      lessonId,
      file: { name: file.name, size: file.size, type: file.type || "video/mp4" },
    });
    setPreparing(false);
    if (!prepared.ok) return setError(prepared.error.message);
    await start(new File([file], file.name, { type: "video/mp4" }), prepared.data.pathname, {
      kind: "lesson-video",
      lessonId,
      videoId: prepared.data.videoId,
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files[0]);
  }

  const busy = preparing || state.phase === "uploading";
  const shownError = error ?? (state.phase === "error" ? state.message : null);

  return (
    <div className="flex flex-col gap-3">
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
            <span className="text-[15px] font-medium">{replacing ? "Drop a new MP4 to replace this video" : "Drop the lecture MP4 here"}</span>
            <span className="text-meta text-ink-soft">MP4 with H.264 video and AAC audio · up to 2 GB · up to 60 minutes</span>
            <input
              ref={input}
              type="file"
              accept="video/mp4,.mp4"
              className="sr-only"
              aria-label="Choose a video file"
              onChange={(e) => {
                void handle(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="md" loading={preparing} onClick={() => input.current?.click()}>
              {replacing ? "Choose a new video" : "Choose a video"}
            </Button>
          </>
        )}
      </div>
      {shownError && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {shownError}
        </p>
      )}
    </div>
  );
}
