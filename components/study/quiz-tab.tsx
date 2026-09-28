"use client";

import { useState } from "react";
import {
  loadPractice,
  savePractice,
  startGraded,
  submitGraded,
} from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/quiz-actions";
import { Badge, Button, ChipGroup, Eyebrow } from "@/components/ui";
import { isCorrect, type GradedQuizSummary, type PracticeQuestion, type QuestionView, type QuizLevel, type TopicMasteryView } from "@/lib/study/quiz";
import { MasteryBars } from "./mastery-bars";
import { QuizRunner, type Answers, type FinishResult } from "./quiz-runner";

/* The lesson player's Quiz tab (feature 16): practice at three levels,
   the lesson's graded quizzes, and mastery by topic. Questions load only
   when a quiz starts; a graded quiz's questions arrive without answers. */

const LEVELS: { value: QuizLevel; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "intermediate", label: "Intermediate" },
  { value: "exam", label: "Exam" },
];

type View =
  | { kind: "home" }
  | { kind: "practice"; level: QuizLevel; questions: PracticeQuestion[] }
  | { kind: "graded"; quiz: GradedQuizSummary; attemptId: string; questions: QuestionView[] };

const toList = (answers: Answers) =>
  Object.entries(answers)
    .filter(([, a]) => a.trim() !== "")
    .map(([questionId, answer]) => ({ questionId, answer }));

export function QuizTab({
  courseId,
  lessonId,
  levelCounts,
  graded: initialGraded,
  mastery: initialMastery,
  preview,
}: {
  courseId: string;
  lessonId: string;
  levelCounts: Record<QuizLevel, number>;
  graded: GradedQuizSummary[];
  mastery: TopicMasteryView[];
  preview: boolean;
}) {
  const firstLevel = LEVELS.find((l) => levelCounts[l.value] > 0)?.value ?? "basic";
  const [level, setLevel] = useState<QuizLevel>(firstLevel);
  const [view, setView] = useState<View>({ kind: "home" });
  const [graded, setGraded] = useState(initialGraded);
  const [mastery, setMastery] = useState(initialMastery);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // For showing "Closed"; the server enforces the due date itself.
  const [now] = useState(() => Date.now());

  const home = () => setView({ kind: "home" });

  if (view.kind === "practice") {
    return (
      <QuizRunner
        mode="practice"
        title={`${LEVELS.find((l) => l.value === view.level)!.label} practice`}
        questions={view.questions}
        courseId={courseId}
        lessonId={lessonId}
        onClose={home}
        onFinish={async (answers): Promise<FinishResult> => {
          const list = toList(answers);
          const res = await savePractice({ lessonId, answers: list });
          if (!res.ok) return { ok: false, message: res.error.message };
          if (res.data.mastery.length) setMastery(res.data.mastery);
          // A staff preview isn't saved, so it has no server score: count here.
          const answered = view.questions.filter((q) => (answers[q.id] ?? "").trim());
          const local = answered.length ? answered.filter((q) => isCorrect(q, answers[q.id])).length / answered.length : 0;
          return { ok: true, score: res.data.score ?? local };
        }}
      />
    );
  }

  if (view.kind === "graded") {
    return (
      <QuizRunner
        mode="graded"
        title={view.quiz.title}
        questions={view.questions}
        courseId={courseId}
        lessonId={lessonId}
        onClose={home}
        onFinish={async (answers): Promise<FinishResult> => {
          const res = await submitGraded({ lessonId, attemptId: view.attemptId, answers: toList(answers) });
          if (!res.ok) return { ok: false, message: res.error.message };
          setMastery(res.data.mastery);
          setGraded((list) =>
            list.map((g) =>
              g.id === view.quiz.id ? { ...g, openAttemptId: null, best: Math.max(g.best ?? 0, res.data.score) } : g,
            ),
          );
          return { ok: true, score: res.data.score, feedback: res.data.feedback };
        }}
      />
    );
  }

  const practiceTotal = levelCounts.basic + levelCounts.intermediate + levelCounts.exam;

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-2.5 text-small text-clay-ink">
          {error}
        </p>
      )}

      {graded.length > 0 && (
        <section aria-label="Graded quizzes" className="flex flex-col gap-3">
          <h3 className="m-0 text-h3 font-semibold">Graded</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {graded.map((g) => {
              const closed = g.dueAt <= now;
              const used = g.attemptsUsed >= g.maxAttempts && !g.openAttemptId;
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[15px] font-medium">{g.title}</span>
                    <span className="text-meta text-ink-soft">
                      {[
                        `Due ${formatDue(g.dueAt)}`,
                        `${g.points} points`,
                        `${g.questionCount} questions`,
                        `${g.attemptsUsed} of ${g.maxAttempts} ${g.maxAttempts === 1 ? "attempt" : "attempts"} used`,
                      ].join(" · ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {g.best !== null && <Badge tone="success">Best {Math.round(g.best * 100)}%</Badge>}
                    {closed ? (
                      <Badge tone="neutral">Closed</Badge>
                    ) : used ? (
                      <Badge tone="neutral">No attempts left</Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busy === g.id}
                        disabled={preview || Boolean(busy)}
                        title={preview ? "Preview: students take graded quizzes here" : undefined}
                        onClick={async () => {
                          setBusy(g.id);
                          setError(null);
                          const res = await startGraded({ lessonId, quizId: g.id });
                          setBusy(null);
                          if (!res.ok) return setError(res.error.message);
                          setGraded((list) =>
                            list.map((x) =>
                              x.id === g.id
                                ? { ...x, openAttemptId: res.data.attemptId, attemptsUsed: x.openAttemptId ? x.attemptsUsed : x.attemptsUsed + 1 }
                                : x,
                            ),
                          );
                          setView({ kind: "graded", quiz: g, attemptId: res.data.attemptId, questions: res.data.questions });
                        }}
                      >
                        {g.openAttemptId ? "Continue" : "Start"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {practiceTotal > 0 && (
        <section aria-label="Practice" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-h3 font-semibold">Practice</h3>
            <p className="m-0 text-small text-ink-soft">
              Instant feedback after each question. Practice doesn&rsquo;t count toward your grade.
              {preview && " Preview: nothing is saved."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChipGroup
              label="Difficulty"
              value={level}
              onValueChange={(v) => setLevel(v as QuizLevel)}
              options={LEVELS.filter((l) => levelCounts[l.value] > 0).map((l) => ({
                value: l.value,
                label: `${l.label} · ${levelCounts[l.value]}`,
              }))}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={busy === "practice"}
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy("practice");
                setError(null);
                const res = await loadPractice({ lessonId, level });
                setBusy(null);
                if (!res.ok) return setError(res.error.message);
                if (res.data.length === 0) return setError("No practice questions at this level yet.");
                setView({ kind: "practice", level, questions: res.data });
              }}
            >
              Start practice
            </Button>
          </div>
        </section>
      )}

      {practiceTotal === 0 && graded.length === 0 && <Eyebrow>No quiz questions for this lesson yet.</Eyebrow>}

      {!preview && <MasteryBars topics={mastery} courseId={courseId} lessonId={lessonId} />}
    </div>
  );
}

function formatDue(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
