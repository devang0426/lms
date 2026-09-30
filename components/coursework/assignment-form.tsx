"use client";

import { useState, useTransition } from "react";
import { saveAssignment } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/assignment-actions";
import { Button, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/coursework/rules";
import type { AssignmentCategory } from "@/lib/db/schema";
import { settle } from "@/lib/utils/action-result";

/* The lesson editor's assignment settings (feature 20): instructions
   (Markdown), due date in the instructor's own time zone, points,
   category, and whether late work is taken. */

export interface AssignmentFormValues {
  instructions: string;
  /* Epoch ms, or null for a new assignment. */
  dueAt: number | null;
  points: number;
  allowLate: boolean;
  category: AssignmentCategory;
}

const pad = (n: number) => String(n).padStart(2, "0");

/* datetime-local text in the browser's time zone. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* A week from now at 23:59, local time. */
function defaultDue(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d.getTime());
}

export function AssignmentForm({ lessonId, initial }: { lessonId: string; initial: AssignmentFormValues }) {
  const [instructions, setInstructions] = useState(initial.instructions);
  const [due, setDue] = useState(() => (initial.dueAt === null ? defaultDue() : toLocalInput(initial.dueAt)));
  const [points, setPoints] = useState(String(initial.points));
  const [category, setCategory] = useState<AssignmentCategory>(initial.category);
  const [allowLate, setAllowLate] = useState(initial.allowLate);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const submit = () => {
    setError(null);
    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) return setError("Pick a due date and time.");
    startSaving(async () => {
      const res = await settle(
        saveAssignment({
          lessonId,
          instructions,
          dueAt: dueDate.toISOString(),
          points: Number(points),
          allowLate,
          category,
        }),
      );
      if (!res.ok) return setError(res.error.message);
      toast.success(initial.dueAt === null ? "Assignment set. Students see it once the lesson is published." : "Assignment saved.");
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        label="Instructions"
        htmlFor={`instructions-${lessonId}`}
        hint="Markdown: **bold**, lists, headings and $math$ all work."
      >
        <Textarea
          id={`instructions-${lessonId}`}
          value={instructions}
          rows={10}
          maxLength={20_000}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="What should students do, and how will it be marked?"
        />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Due" htmlFor={`due-${lessonId}`} hint="Your time zone.">
          <Input id={`due-${lessonId}`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Points" htmlFor={`points-${lessonId}`}>
            <Input id={`points-${lessonId}`} type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor={`category-${lessonId}`}>
            <Select id={`category-${lessonId}`} value={category} onChange={(e) => setCategory(e.target.value as AssignmentCategory)}>
              {(Object.keys(CATEGORY_LABELS) as AssignmentCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-[15px]">
        <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} className="mt-1 size-4 accent-terracotta" />
        <span className="flex flex-col gap-0.5">
          Accept late work
          <span className="text-meta text-ink-soft">Work handed in after the due date is taken and marked late. Otherwise the assignment closes.</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-meta">
          {error ? (
            <span role="alert" className="text-terracotta">
              {error}
            </span>
          ) : (
            <span className="text-ink-soft">Changing the points doesn&rsquo;t change grades already given.</span>
          )}
        </span>
        <Button type="submit" size="md" loading={saving}>
          {initial.dueAt === null ? "Set assignment" : "Save assignment"}
        </Button>
      </div>
    </form>
  );
}
