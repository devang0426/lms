"use client";

import { useState } from "react";
import { removeQuestion, saveQuestion } from "@/app/(instructor)/instructor/courses/[courseId]/lessons/[lessonId]/review/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Badge, Input, Select, Textarea } from "@/components/ui";
import type { QuizBank, QuizDifficulty, QuizType } from "@/lib/db/schema";
import { cn } from "@/lib/utils/cn";
import { RowActions, VideoTimeLink } from "./shared";

/* Quiz tab: questions grouped by level. Each question's text, options,
   correct answer, explanation, level and bank (practice or graded). */

export interface QuestionItem {
  id: string;
  type: QuizType;
  difficulty: QuizDifficulty;
  bank: QuizBank;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  startSec: number | null;
  published: boolean;
}

const LEVELS: { key: QuizDifficulty; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "intermediate", label: "Intermediate" },
  { key: "exam", label: "Exam" },
];

const TYPE_LABELS: Record<QuizType, string> = { mcq: "Multiple choice", true_false: "True / false", fill_blank: "Fill the blank" };

export function QuizEditor({ lessonId, questions, playerHref }: { lessonId: string; questions: QuestionItem[]; playerHref: string }) {
  return (
    <div className="flex flex-col gap-8">
      {LEVELS.map((level) => {
        const list = questions.filter((q) => q.difficulty === level.key);
        return (
          <section key={level.key} aria-labelledby={`level-${level.key}`} className="flex flex-col gap-3">
            <h3 id={`level-${level.key}`} className="m-0 flex items-baseline gap-2 text-h3 font-semibold">
              {level.label}
              <span className="font-mono text-meta font-normal text-ink-soft">{list.length}</span>
            </h3>
            {list.length === 0 ? (
              <p className="m-0 text-small text-ink-soft">No {level.label.toLowerCase()} questions.</p>
            ) : (
              list.map((q, i) => (
                <QuestionRow key={`${q.id}-${JSON.stringify(q)}`} lessonId={lessonId} q={q} index={i} playerHref={playerHref} />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function QuestionRow({ lessonId, q, index, playerHref }: { lessonId: string; q: QuestionItem; index: number; playerHref: string }) {
  const initial = {
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    topic: q.topic,
    difficulty: q.difficulty,
    bank: q.bank,
  };
  const [draft, setDraft] = useState(initial);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const id = `q-${q.id}`;
  const fixedOptions = q.type === "true_false";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
          Q{index + 1} · {TYPE_LABELS[q.type]}
        </span>
        {!q.published && <Badge size="sm">Draft</Badge>}
        <span className="grow" />
        <VideoTimeLink href={playerHref} sec={q.startSec} />
      </div>
      <label htmlFor={`${id}-question`} className="sr-only">Question</label>
      <Textarea
        id={`${id}-question`}
        rows={2}
        value={draft.question}
        maxLength={1000}
        onChange={(e) => setDraft({ ...draft, question: e.target.value })}
        className="font-medium"
      />

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-meta font-medium">{q.type === "fill_blank" ? "Answer" : "Options · pick the correct one"}</legend>
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {q.type !== "fill_blank" && (
              <input
                type="radio"
                name={`${id}-correct`}
                checked={draft.correctIndex === i}
                onChange={() => setDraft({ ...draft, correctIndex: i })}
                aria-label={`Option ${i + 1} is correct`}
                className="size-4 shrink-0 accent-sage"
              />
            )}
            <Input
              value={opt}
              readOnly={fixedOptions}
              maxLength={500}
              onChange={(e) => setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })}
              aria-label={`Option ${i + 1}`}
              className={cn("h-10 text-small", draft.correctIndex === i && "border-sage")}
            />
          </div>
        ))}
      </fieldset>

      <label htmlFor={`${id}-explanation`} className="text-meta font-medium">Explanation</label>
      <Textarea
        id={`${id}-explanation`}
        rows={2}
        value={draft.explanation}
        maxLength={1500}
        onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
        className="text-small"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} aria-label="Topic" placeholder="Topic" maxLength={80} className="h-9 w-[180px] text-small" />
        <Select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as QuizDifficulty })} aria-label="Level" className="h-9 w-[150px] text-small">
          {LEVELS.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </Select>
        <Select value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value as QuizBank })} aria-label="Question bank" className="h-9 w-[150px] text-small">
          <option value="practice">Practice</option>
          <option value="graded">Graded</option>
        </Select>
        <span className="grow" />
        <RowActions
          dirty={dirty}
          pending={pending}
          label={`question ${index + 1}`}
          onSave={() => run(() => saveQuestion({ lessonId, id: q.id, type: q.type, ...draft }))}
          onDelete={() => run(() => removeQuestion({ lessonId, id: q.id }))}
        />
      </div>
    </div>
  );
}
