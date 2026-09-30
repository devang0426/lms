"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { startLectureUpload } from "@/app/(instructor)/instructor/courses/actions";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Icon, Input } from "@/components/ui";
import { useVideoUpload, VideoDropZone } from "@/components/video/video-uploader";
import { titleFromVideoName } from "@/lib/video/upload-check";

/* "Upload lecture" on a module (feature 27, V1): pick the MP4, keep or
   change the title (filled in from the file name), upload. It makes the
   video lesson and runs the upload here, because leaving the page would
   stop it; once processing has started it opens the lesson's editor,
   which shows the progress. Three clicks from the course page. */
export function UploadLectureDialog({ courseId, moduleId, moduleTitle }: { courseId: string; moduleId: string; moduleTitle: string }) {
  const router = useRouter();
  const titleId = useId();
  const video = useVideoUpload();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [lessonHref, setLessonHref] = useState<string | null>(null);

  const sending = video.busy || video.state.phase === "done";

  // Leaving the page mid-upload stops it: ask first.
  useEffect(() => {
    if (!video.busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [video.busy]);

  function onOpenChange(next: boolean) {
    if (!next && sending) return; // the dialog stays until the upload is done
    setOpen(next);
    if (!next) {
      video.reset();
      setFile(null);
      setTitle("");
      setTitleTouched(false);
      setLessonHref(null);
    }
  }

  function choose(picked: File) {
    setFile(picked);
    if (!titleTouched) setTitle(titleFromVideoName(picked.name));
    video.check(picked);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || sending) return;
    const result = await video.upload(file, (info) =>
      startLectureUpload({ moduleId, title: title.trim() || titleFromVideoName(file.name), file: info }),
    );
    if (!result) return;
    const href = `/instructor/courses/${courseId}/lessons/${result.prepared.lessonId}`;
    setLessonHref(href);
    if (result.final.phase === "done") router.push(href);
  }

  // The lesson exists but the upload didn't make it: its editor takes a
  // new try (or offers Retry when only the processing failed to start).
  const stranded = lessonHref !== null && video.state.phase === "error";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="xs" leading={<Icon icon={Upload} size={14} />} aria-label={`Upload lecture to ${moduleTitle}`}>
          Upload lecture
        </Button>
      </DialogTrigger>
      <DialogContent title="Upload a lecture" description={`A new video lesson in “${moduleTitle}”. Processing starts when the upload finishes.`}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <VideoDropZone
            state={video.state}
            busy={sending}
            preparing={video.preparing}
            heading="Drop the lecture MP4 here"
            buttonLabel="Choose a video"
            chosen={file}
            onFile={choose}
          />
          <Field label="Lesson title" htmlFor={titleId} hint="Filled in from the file name. Change it if you like.">
            <Input
              id={titleId}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              maxLength={200}
              disabled={sending || stranded}
              placeholder="e.g. Eigenvectors, visually"
            />
          </Field>
          {video.error && (
            <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
              {video.error}
              {stranded && " The lesson was added: open it to try again."}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="quiet" size="md" disabled={sending}>
                {stranded ? "Close" : "Cancel"}
              </Button>
            </DialogClose>
            {stranded ? (
              <Button asChild size="md">
                <Link href={lessonHref}>Open the lesson</Link>
              </Button>
            ) : (
              <Button type="submit" size="md" loading={sending} disabled={!file}>
                Upload
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
