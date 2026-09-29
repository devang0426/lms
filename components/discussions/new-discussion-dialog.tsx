"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { startDiscussion } from "@/app/(student)/(sidebar)/discussions/actions";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Icon, Input, Select, Textarea } from "@/components/ui";
import { DISCUSSION_LIMITS } from "@/lib/discussions/view";

/* Start a discussion thread (feature 21). From /discussions the student
   picks the course and lands on the new thread. From a lesson (its
   Discussion tab, or the assistant's "Ask your instructor") the course and
   lesson are fixed, the draft may be pre-filled, and the dialog stays on
   the page with a link to the thread. The whole class can read it. */

export interface DiscussionCourseOption {
  id: string;
  code: string;
  title: string;
}

export function NewDiscussionDialog({
  trigger,
  courses,
  lesson,
  initial,
  openAfterPost = false,
}: {
  trigger: ReactNode;
  /* One course (fixed) or several (a picker). */
  courses: DiscussionCourseOption[];
  lesson?: { id: string; title: string };
  initial?: { title: string; body: string };
  /* Go to the new thread (from /discussions) instead of staying put. */
  openAfterPost?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  const course = courses.find((c) => c.id === courseId);

  function reset() {
    setTitle(initial?.title ?? "");
    setBody(initial?.body ?? "");
    setError(null);
    setPosted(null);
  }

  async function submit() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await startDiscussion({ courseId, lessonId: lesson?.id ?? null, title, body });
      if (!res.ok) return setError(res.error.message);
      if (openAfterPost) {
        setOpen(false);
        router.push(res.data.href);
      } else {
        setPosted(res.data.href);
      }
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
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={posted ? "Question posted" : "Ask your instructor"}
        description={
          posted
            ? undefined
            : `Your question goes to ${course ? `${course.code}'s` : "the course's"} discussion. Your instructor and classmates can read and reply.`
        }
      >
        {posted ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 flex items-start gap-2.5 text-[15px] leading-[1.55]">
              <Icon icon={CheckCircle2} className="mt-0.5 shrink-0 text-sage" />
              Your instructor will see it with the other unanswered questions. You&rsquo;ll get a notification when someone replies.
            </p>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href={posted}>View the thread</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {courses.length > 1 ? (
              <Field label="Course" htmlFor="discussion-course">
                <Select id="discussion-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              course && (
                <p className="m-0 font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
                  {[course.code, lesson?.title].filter(Boolean).join(" · ")}
                </p>
              )
            )}
            <Field label="Question" htmlFor="discussion-title" hint="One line, like the subject of an email.">
              <Input
                id="discussion-title"
                value={title}
                maxLength={DISCUSSION_LIMITS.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Why is the span of two parallel vectors only a line?"
              />
            </Field>
            <Field label="Details" htmlFor="discussion-body" hint="Markdown and $maths$ work.">
              <Textarea
                id="discussion-body"
                rows={6}
                value={body}
                maxLength={DISCUSSION_LIMITS.body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What have you tried, and where did you get stuck?"
              />
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
                Post question
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
