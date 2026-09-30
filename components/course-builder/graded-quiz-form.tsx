"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGradedQuiz } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/graded-quizzes/new/actions";
import { Badge, Button, Card, Field, Input, toast } from "@/components/ui";
import { renderRichInline } from "@/lib/markdown";
import type { QuizLevel } from "@/lib/study/quiz";
import { settle } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

/* "Create graded quiz from bank" (feature 16). The instructor picks
   questions from the lesson's bank and sets the due date, attempts and
   points. Picked questions leave the practice bank. */

export interface BankQuestion {
  id: string;
  type: "mcq" | "true_false" | "fill_blank";
  difficulty: QuizLevel;
  topic: string;
  question: string;
  bank: "practice" | "graded";
  status: "draft" | "published";
}

const LEVEL_LABEL: Record<QuizLevel, string> = { basic: "Basic", intermediate: "Intermediate", exam: "Exam" };
const TYPE_LABEL = { mcq: "Multiple choice", true_false: "True / false", fill_blank: "Fill in the blank" } as const;

/* A week from now at 23:59, in the browser's time zone, as datetime-local text. */
function defaultDue(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GradedQuizForm({
  lessonId,
  lessonTitle,
  backHref,
  questions,
}: {
  lessonId: string;
  lessonTitle: string;
  backHref: string;
  questions: BankQuestion[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(`${lessonTitle} quiz`);
  const [due, setDue] = useState(defaultDue);
  const [attempts, setAttempts] = useState("1");
  const [points, setPoints] = useState("10");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    setError(null);
    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) return setError("Pick a due date and time.");
    startSaving(async () => {
      const res = await settle(
        createGradedQuiz({
          lessonId,
          title,
          dueAt: dueDate.toISOString(),
          maxAttempts: Number(attempts),
          points: Number(points),
          questionIds: questions.filter((q) => picked.has(q.id)).map((q) => q.id),
        }),
      );
      if (!res.ok) return setError(res.error.message);
      toast.success("Graded quiz created. Students see it in the lesson's Quiz tab.");
      router.push(backHref);
    });
  };

  const levels = (["basic", "intermediate", "exam"] as const).filter((l) => questions.some((q) => q.difficulty === l));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card className="gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" htmlFor="gq-title" className="md:col-span-2">
            <Input id="gq-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Due" htmlFor="gq-due" hint="Students can't start it after this. Your time zone.">
            <Input id="gq-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Attempts" htmlFor="gq-attempts">
              <Input id="gq-attempts" type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
            </Field>
            <Field label="Points" htmlFor="gq-points">
              <Input id="gq-points" type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <fieldset className="m-0 flex flex-col gap-5 border-0 p-0">
        <legend className="mb-3 flex w-full items-baseline justify-between gap-3 p-0">
          <span className="text-h3 font-semibold">Questions</span>
          <span className="text-meta text-ink-soft">{picked.size} picked</span>
        </legend>
        {levels.map((level) => (
          <div key={level} className="flex flex-col gap-2">
            <span className="font-mono text-label text-ink-soft uppercase">{LEVEL_LABEL[level]}</span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {questions
                .filter((q) => q.difficulty === level)
                .map((q) => (
                  <li key={q.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3",
                        picked.has(q.id) ? "border-ink bg-oat" : "border-line bg-paper hover:bg-oat",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(q.id)}
                        onChange={() => toggle(q.id)}
                        className="mt-1 size-4 accent-terracotta"
                      />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-[15px]" dangerouslySetInnerHTML={{ __html: renderRichInline(q.question) }} />
                        <span className="flex flex-wrap items-center gap-2 text-meta text-ink-soft">
                          {TYPE_LABEL[q.type]}
                          {q.topic && <> · {q.topic}</>}
                          {q.bank === "graded" && <Badge tone="warning" size="sm">In a graded quiz</Badge>}
                          {q.status === "draft" && <Badge tone="neutral" size="sm">Draft</Badge>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-meta">
          {error ? (
            <span role="alert" className="text-terracotta">
              {error}
            </span>
          ) : (
            <span className="text-ink-soft">Picked questions move out of practice, so students can&rsquo;t see their answers early.</span>
          )}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="quiet" size="md" onClick={() => router.push(backHref)}>
            Cancel
          </Button>
          <Button type="submit" size="md" loading={saving} disabled={picked.size === 0}>
            Create graded quiz
          </Button>
        </div>
      </div>
    </form>
  );
}
