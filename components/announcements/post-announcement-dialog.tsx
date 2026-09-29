"use client";

import { Megaphone } from "lucide-react";
import { useState } from "react";
import { postAnnouncement } from "@/app/(instructor)/instructor/announcement-actions";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Icon, Input, Select, Textarea, toast } from "@/components/ui";

/* "Post announcement" (feature 21), on the instructor dashboard and in
   Messages: pick one of the courses you teach, write it, post. Every
   student enrolled in the course gets a notification. Secondary, as in
   the design system. */
export function PostAnnouncementDialog({ courses }: { courses: { id: string; code: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await postAnnouncement({ courseId, title, body });
      if (!res.ok) return setError(res.error.message);
      const code = courses.find((c) => c.id === courseId)?.code ?? "the course";
      toast.success(`Posted to ${code}. Its students have been notified.`);
      setOpen(false);
      setTitle("");
      setBody("");
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="md" leading={<Icon icon={Megaphone} size={17} />} disabled={courses.length === 0}>
          Post announcement
        </Button>
      </DialogTrigger>
      <DialogContent title="Post announcement" description="Students see it on the course page and get a notification.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Course" htmlFor="announcement-course">
            <Select id="announcement-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="announcement-title">
            <Input id="announcement-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office hours move to Thursday" />
          </Field>
          <Field label="Message" htmlFor="announcement-body" hint="Markdown and $maths$ work.">
            <Textarea id="announcement-body" rows={6} value={body} maxLength={10_000} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="m-0 rounded-xl bg-clay px-3.5 py-2.5 text-small text-clay-ink">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!courseId || !title.trim() || !body.trim()}>
              Post
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
