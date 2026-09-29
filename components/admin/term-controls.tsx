"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createTerm, makeCurrentTerm } from "@/app/(admin)/admin/terms/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Icon, Input, toast } from "@/components/ui";

/* Terms (feature 22): add a term, and make one current. */
export function NewTermDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(false);
  const { pending, run } = useAction();

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="md" leading={<Icon icon={Plus} size={17} />}>
          New term
        </Button>
      </DialogTrigger>
      <DialogContent title="New term">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createTerm({ name, startsOn, endsOn, makeCurrent }),
              () => {
                toast.success(`${name} added.`);
                setOpen(false);
                setName("");
                setStartsOn("");
                setEndsOn("");
                setMakeCurrent(false);
              },
            );
          }}
        >
          <Field label="Name" htmlFor="term-name">
            <Input id="term-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Spring 2027" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="term-start">
              <Input id="term-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="Ends" htmlFor="term-end">
              <Input id="term-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-small">
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} className="size-4 accent-sage" />
            Make it the current term
          </label>
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!name.trim() || !startsOn || !endsOn}>
              Add term
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MakeCurrentButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="quiet" size="xs" loading={pending} onClick={() => run(() => makeCurrentTerm({ id }), () => toast.success(`${name} is now the current term.`))}>
      Make current
    </Button>
  );
}
