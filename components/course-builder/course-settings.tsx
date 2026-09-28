"use client";

import { useState, type FormEvent } from "react";
import { setCoursePublished, updateCourseDetails } from "@/app/(instructor)/instructor/courses/actions";
import { Button, Field, Input, Textarea, toast } from "@/components/ui";
import type { Course, CoverTintValue } from "@/lib/db/schema";
import { cn } from "@/lib/utils/cn";
import { useAction } from "./use-action";

/* The course's one primary action: publish (or take it back to draft). */
export function PublishCourseButton({ courseId, published }: { courseId: string; published: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant={published ? "quiet" : "primary"}
      loading={pending}
      onClick={() =>
        run(
          () => setCoursePublished({ id: courseId, published: !published }),
          () => toast.success(published ? "Course moved back to draft." : "Course published."),
        )
      }
    >
      {published ? "Unpublish course" : "Publish course"}
    </Button>
  );
}

const tints: { value: CoverTintValue; label: string; swatch: string }[] = [
  { value: "clay", label: "Clay", swatch: "bg-clay" },
  { value: "sage", label: "Sage", swatch: "bg-sage-tint" },
  { value: "butter", label: "Butter", swatch: "bg-butter-tint" },
  { value: "stripe", label: "Stripe", swatch: "bg-stripe" },
];

export function CourseDetailsForm({ course }: { course: Course }) {
  const { pending, run } = useAction();
  const [coverTint, setCoverTint] = useState<CoverTintValue>(course.coverTint);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    run(
      () =>
        updateCourseDetails({
          courseId: course.id,
          code: text("code"),
          title: text("title"),
          subject: text("subject"),
          level: text("level"),
          summary: text("summary"),
          outcomes: text("outcomes")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          coverTint,
        }),
      () => toast.success("Course details saved."),
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[720px] flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        <Field label="Code" htmlFor="code">
          <Input id="code" name="code" defaultValue={course.code} required maxLength={20} />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={course.title} required maxLength={200} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Subject" htmlFor="subject" hint="Shown as a catalog filter, e.g. Mathematics.">
          <Input id="subject" name="subject" defaultValue={course.subject} maxLength={60} />
        </Field>
        <Field label="Level" htmlFor="level" hint="e.g. Beginner, Intermediate.">
          <Input id="level" name="level" defaultValue={course.level} maxLength={40} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="summary">
        <Textarea id="summary" name="summary" defaultValue={course.summary} rows={4} maxLength={2000} />
      </Field>
      <Field label="You'll be able to" htmlFor="outcomes" hint="One outcome per line. Up to 12.">
        <Textarea id="outcomes" name="outcomes" defaultValue={course.outcomes.join("\n")} rows={5} />
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-meta font-medium">Cover</legend>
        <div className="flex flex-wrap gap-3">
          {tints.map((t) => (
            <label
              key={t.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-small",
                coverTint === t.value ? "border-ink" : "border-line",
              )}
            >
              <input
                type="radio"
                name="coverTint"
                value={t.value}
                checked={coverTint === t.value}
                onChange={() => setCoverTint(t.value)}
                className="sr-only"
              />
              <span className={cn("size-6 rounded-full border border-line", t.swatch)} aria-hidden />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Save details
        </Button>
      </div>
    </form>
  );
}
