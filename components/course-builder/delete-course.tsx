"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { courseDeleteCheck, deleteCourse } from "@/app/(instructor)/instructor/courses/actions";
import { Button, Card, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Icon, Input, toast } from "@/components/ui";
import { confirmsCourse } from "@/lib/courses/delete";
import { settle } from "@/lib/utils/action-result";

/* The foot of the builder's Details tab (feature 35). Opening the dialog
   asks the server what would go, or why the course can't be deleted
   (students enrolled, work handed in, an invitation pending), so the page
   itself reads nothing extra. Deleting takes the course code, typed. */
export function DeleteCourseSection({ courseId, code }: { courseId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<{ refusal: string | null; contents: string[] } | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [deleting, startDeleting] = useTransition();

  function onOpenChange(next: boolean) {
    if (deleting) return;
    setOpen(next);
    setTyped("");
    setError(null);
    if (!next) return;
    setCheck(null);
    startChecking(async () => {
      const res = await settle(courseDeleteCheck({ courseId }));
      if (res.ok) setCheck(res.data);
      else setError(res.error.message);
    });
  }

  function remove() {
    setError(null);
    startDeleting(async () => {
      const res = await settle(deleteCourse({ courseId, confirm: typed }));
      if (!res.ok) return setError(res.error.message);
      toast.success(`${code} was deleted.`);
      router.push("/instructor/courses");
    });
  }

  const inputId = `delete-course-${courseId}`;
  const refused = check?.refusal ?? null;

  return (
    <Card className="gap-3">
      <h2 className="m-0 text-h3 font-semibold">Delete this course</h2>
      <p className="m-0 max-w-[620px] text-small text-ink-soft">
        Deletes the course and everything in it. It&apos;s only possible while no student is enrolled and nobody has handed in work.
        Otherwise, unpublish it: students stop seeing it, and its records stay.
      </p>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="md" className="self-start" leading={<Icon icon={Trash2} size={16} />}>
            Delete course
          </Button>
        </DialogTrigger>
        <DialogContent
          title={refused ? `${code} can't be deleted` : `Delete ${code}?`}
          description={checking || !check ? "Checking what's in it…" : (refused ?? "This can't be undone.")}
        >
          {check && !refused && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmsCourse(typed, code)) remove();
              }}
            >
              <div className="flex flex-col gap-2">
                <p className="m-0 text-small font-medium">Deleted with it</p>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-small">
                  {check.contents.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <Field label={`Type ${code} to confirm`} htmlFor={inputId}>
                <Input id={inputId} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              </Field>
              {error && (
                <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="quiet" size="md" disabled={deleting}>
                    Keep it
                  </Button>
                </DialogClose>
                <Button type="submit" variant="secondary" size="md" loading={deleting} disabled={!confirmsCourse(typed, code)}>
                  Delete course
                </Button>
              </div>
            </form>
          )}
          {/* The check itself failed (the refusal is the description). */}
          {!check && error && (
            <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
