"use client";

import "katex/dist/katex.min.css";

import { Check, Play, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOptionalPlayer } from "@/components/player/player-context";
import { Badge, Button, Eyebrow, Icon, Input, ProgressBar } from "@/components/ui";
import { renderRichInline } from "@/lib/markdown";
import { correctAnswerText, isCorrect, type AnswerFeedback, type PracticeQuestion, type QuestionView } from "@/lib/study/quiz";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils/cn";

/* One quiz, one question at a time (feature 16).
   - practice: questions come with their answers; "Check" gives instant
     feedback and the explanation. The finished set is saved (and
     re-scored) by the server.
   - graded: no answers in the browser. Answers are collected, then
     submitted; the server scores them and only then returns what was right,
     with explanations. */

export type Answers = Record<string, string>;
export type FinishResult = { ok: true; score: number; feedback?: AnswerFeedback[] } | { ok: false; message: string };

type Props = {
  title: string;
  courseId: string;
  lessonId: string;
  onFinish: (answers: Answers) => Promise<FinishResult>;
  onClose: () => void;
} & ({ mode: "practice"; questions: PracticeQuestion[] } | { mode: "graded"; questions: QuestionView[] });

export function QuizRunner(props: Props) {
  const { questions, mode, title } = props;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ score: number; feedback: AnswerFeedback[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[index];
  const answer = answers[q?.id ?? ""] ?? "";
  const practice = mode === "practice" ? (q as PracticeQuestion) : null;
  const isChecked = Boolean(checked[q?.id ?? ""]);
  const last = index === questions.length - 1;
  const unanswered = questions.filter((x) => !(answers[x.id] ?? "").trim()).length;

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    const res = await props.onFinish(answers);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    // Practice feedback is known here; graded feedback comes from the server.
    const feedback =
      res.feedback ??
      (props.mode === "practice"
        ? props.questions.map((x) => ({
            questionId: x.id,
            answer: answers[x.id] ?? "",
            correct: isCorrect(x, answers[x.id] ?? ""),
            correctAnswer: correctAnswerText(x),
            explanation: x.explanation,
            startSec: x.startSec,
          }))
        : []);
    setResult({ score: res.score, feedback });
  };

  if (result) {
    return (
      <Summary
        title={title}
        score={result.score}
        feedback={result.feedback}
        questions={questions}
        courseId={props.courseId}
        lessonId={props.lessonId}
        onClose={props.onClose}
      />
    );
  }
  if (!q) return null;

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>
          {title} · Question {index + 1} of {questions.length}
        </Eyebrow>
        <Button variant="link" size="xs" onClick={props.onClose}>
          {/* Nothing is stored until submit; a graded attempt stays open to resume. */}
          {mode === "graded" ? "Leave" : "Stop"}
        </Button>
      </div>
      <ProgressBar value={(index / questions.length) * 100} label="Quiz progress" />

      <div className="flex flex-col gap-5 rounded-3xl border border-line bg-paper px-6 py-6 md:px-8">
        {q.topic && <span className="font-mono text-label text-ink-soft uppercase">{q.topic}</span>}
        <p className="m-0 text-[19px] leading-[1.5] font-medium" dangerouslySetInnerHTML={{ __html: renderRichInline(q.question) }} />

        {q.type === "fill_blank" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (practice && !isChecked && answer.trim()) setChecked((c) => ({ ...c, [q.id]: true }));
            }}
          >
            <label htmlFor={`blank-${q.id}`} className="sr-only">
              Your answer
            </label>
            <Input
              id={`blank-${q.id}`}
              value={answer}
              maxLength={200}
              autoComplete="off"
              placeholder="Type the missing word or number"
              disabled={isChecked}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          </form>
        ) : (
          <div role="radiogroup" aria-label="Answers" className="flex flex-col gap-2">
            {q.options.map((opt, i) => {
              const selected = answer === String(i);
              const right = practice && isChecked && i === practice.correctIndex;
              const wrong = practice && isChecked && selected && i !== practice.correctIndex;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isChecked}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: String(i) }))}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[15px] transition-colors disabled:cursor-default",
                    selected ? "border-ink bg-oat" : "border-line bg-paper hover:bg-oat",
                    right && "border-sage bg-sage-tint text-sage-ink",
                    wrong && "border-terracotta bg-clay text-clay-ink",
                  )}
                >
                  <span className="font-mono text-meta text-ink-soft">{String.fromCharCode(65 + i)}</span>
                  <span dangerouslySetInnerHTML={{ __html: renderRichInline(opt) }} />
                  {right && <Icon icon={Check} size={16} className="ml-auto" />}
                  {wrong && <Icon icon={X} size={16} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        )}

        {practice && isChecked && (
          <Feedback
            correct={isCorrect(practice, answer)}
            correctAnswer={correctAnswerText(practice)}
            explanation={practice.explanation}
            startSec={practice.startSec}
            courseId={props.courseId}
            lessonId={props.lessonId}
            showAnswer={practice.type === "fill_blank"}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-meta text-ink-soft">
          {error ? (
            <span role="alert" className="text-terracotta">
              {error}
            </span>
          ) : mode === "graded" ? (
            "Answers are checked when you submit."
          ) : null}
        </span>
        <div className="flex gap-2">
          {mode === "graded" && index > 0 && (
            <Button variant="quiet" size="sm" onClick={() => setIndex((i) => i - 1)}>
              Previous
            </Button>
          )}
          {practice && !isChecked ? (
            <Button variant="secondary" size="sm" disabled={!answer.trim()} onClick={() => setChecked((c) => ({ ...c, [q.id]: true }))}>
              Check
            </Button>
          ) : !last ? (
            <Button variant="secondary" size="sm" onClick={() => setIndex((i) => i + 1)}>
              Next
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={submitting}
              onClick={() => {
                if (mode === "graded" && unanswered > 0 && !window.confirm(`${unanswered} unanswered. Submit anyway? Blank answers count as wrong.`)) return;
                void finish();
              }}
            >
              {mode === "graded" ? "Submit answers" : "Finish"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Feedback({
  correct,
  correctAnswer,
  explanation,
  startSec,
  courseId,
  lessonId,
  showAnswer,
}: {
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  startSec: number | null;
  courseId: string;
  lessonId: string;
  showAnswer: boolean;
}) {
  return (
    <div aria-live="polite" className={cn("flex flex-col gap-2 rounded-2xl px-4 py-3", correct ? "bg-sage-tint" : "bg-clay")}>
      <p className={cn("m-0 text-[15px] font-medium", correct ? "text-sage-ink" : "text-clay-ink")}>
        {correct ? "Correct" : "Not quite"}
        {!correct && showAnswer && (
          <>
            {" "}
            · the answer is <span dangerouslySetInnerHTML={{ __html: renderRichInline(correctAnswer) }} />
          </>
        )}
      </p>
      {explanation && <p className="m-0 text-small text-ink" dangerouslySetInnerHTML={{ __html: renderRichInline(explanation) }} />}
      {startSec !== null && <ReviewInVideo sec={startSec} courseId={courseId} lessonId={lessonId} />}
    </div>
  );
}

function ReviewInVideo({ sec, courseId, lessonId }: { sec: number; courseId: string; lessonId: string }) {
  const player = useOptionalPlayer();
  const cls =
    "inline-flex h-6 cursor-pointer items-center gap-1 self-start rounded-full border-0 bg-paper px-2.5 font-mono text-[12px] text-clay-ink no-underline hover:bg-oat hover:text-clay-ink";
  const body = (
    <>
      <Icon icon={Play} size={10} fill="currentColor" />
      Review in video · {formatTime(sec)}
    </>
  );
  if (player) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          player.seek(sec);
          player.videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      >
        {body}
      </button>
    );
  }
  return (
    <Link href={`/courses/${courseId}/lessons/${lessonId}?t=${Math.floor(sec)}`} className={cls}>
      {body}
    </Link>
  );
}

function Summary({
  title,
  score,
  feedback,
  questions,
  courseId,
  lessonId,
  onClose,
}: {
  title: string;
  score: number;
  feedback: AnswerFeedback[];
  questions: QuestionView[];
  courseId: string;
  lessonId: string;
  onClose: () => void;
}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const right = feedback.filter((f) => f.correct).length;
  return (
    <section aria-label={`${title} results`} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-paper px-6 py-8 text-center">
        <Eyebrow>{title} · Results</Eyebrow>
        <p className="m-0 font-serif text-[48px] leading-none">{Math.round(score * 100)}%</p>
        <p className="m-0 text-small text-ink-soft">
          {right} of {feedback.length} correct
        </p>
        <Button variant="secondary" size="sm" onClick={onClose} className="mt-2">
          Done
        </Button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {feedback.map((f, i) => {
          const q = byId.get(f.questionId);
          if (!q) return null;
          const yours = q.type === "fill_blank" ? f.answer : (q.options[Number(f.answer)] ?? "");
          return (
            <li key={f.questionId} className="flex flex-col gap-2 rounded-2xl border border-line bg-paper px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="m-0 text-[15px] font-medium">
                  <span className="mr-2 font-mono text-meta text-ink-soft">{i + 1}</span>
                  <span dangerouslySetInnerHTML={{ __html: renderRichInline(q.question) }} />
                </p>
                <Badge tone={f.correct ? "success" : "new"}>{f.correct ? "Correct" : "Wrong"}</Badge>
              </div>
              <p className="m-0 text-small text-ink-soft">
                Your answer: {yours.trim() ? <span className="text-ink" dangerouslySetInnerHTML={{ __html: renderRichInline(yours) }} /> : <em>none</em>}
                {!f.correct && (
                  <>
                    {" "}
                    · Correct: <span className="text-ink" dangerouslySetInnerHTML={{ __html: renderRichInline(f.correctAnswer) }} />
                  </>
                )}
              </p>
              {!f.correct && f.explanation && (
                <p className="m-0 text-small" dangerouslySetInnerHTML={{ __html: renderRichInline(f.explanation) }} />
              )}
              {!f.correct && f.startSec !== null && <ReviewInVideo sec={f.startSec} courseId={courseId} lessonId={lessonId} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
