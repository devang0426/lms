"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { createCourse } from "@/app/(instructor)/instructor/courses/actions";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "./use-action";

export function NewCourseForm() {
  const router = useRouter();
  const { pending, run } = useAction();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    run(
      () => createCourse({ code: text("code"), title: text("title"), subject: text("subject"), level: text("level") }),
      ({ id }) => router.push(`/instructor/courses/${id}`),
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[560px] flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <Field label="Code" htmlFor="code">
          <Input id="code" name="code" placeholder="MATH 201" required maxLength={20} />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" placeholder="Linear Algebra" required maxLength={200} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Subject" htmlFor="subject">
          <Input id="subject" name="subject" placeholder="Mathematics" maxLength={60} />
        </Field>
        <Field label="Level" htmlFor="level">
          <Input id="level" name="level" placeholder="Intermediate" maxLength={40} />
        </Field>
      </div>
      <p className="m-0 text-small text-ink-soft">
        New courses start as drafts in the current term, with one section. Students see nothing until you publish.
      </p>
      <div>
        <Button type="submit" loading={pending}>
          Create course
        </Button>
      </div>
    </form>
  );
}
