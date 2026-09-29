"use client";

import { Loader2, MapPin, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Button, ChipGroup, Icon, Textarea } from "@/components/ui";
import type { AssistantMode, ChatCitation, TurnView } from "@/lib/chat/types";
import { cn } from "@/lib/utils/cn";
import { AnswerBody } from "./answer-body";
import { CitationChip, citationHref, isDocumentCitation, useCitationSeek } from "./citation-chip";
import { Refusal } from "./refusal";
import { streamAnswer } from "./stream";

/* The course assistant (feature 14): ask, read an answer with chips that
   jump to the lecture, or ask "Where was this taught?" for moments only.
   In the lesson player it can ask about this lesson or the whole course.
   The answer streams from POST /api/assistant (NDJSON); the final "done"
   event carries the server-checked answer, which replaces the streamed
   text. Threads persist: the newest one for the scope is reopened. */

export interface ChatThreadView {
  id: string;
  turns: TurnView[];
}

type Scope = "lesson" | "course";

interface Pending {
  question: string;
  mode: AssistantMode;
  text: string;
}

export function AssistantChat({
  courseId,
  courseCode,
  courseTitle,
  lessonId,
  lessonTitle,
  initialThread,
  suggestions,
  primary = false,
}: {
  courseId: string;
  /* "MATH 201": labels the question "Ask your instructor" posts. */
  courseCode: string;
  courseTitle: string;
  /* The lesson being watched: enables "This lesson" scope and seeking. */
  lessonId?: string;
  lessonTitle?: string;
  /* The newest thread for the starting scope (lesson if given, else course). */
  initialThread: ChatThreadView | null;
  /* Chapter titles to suggest as questions. */
  suggestions: string[];
  /* Ask is the page's Terracotta action (not in the player, where Next lesson is). */
  primary?: boolean;
}) {
  const [scope, setScope] = useState<Scope>(lessonId ? "lesson" : "course");
  // One conversation per scope, kept while the page is open.
  const [threads, setThreads] = useState<Record<Scope, ChatThreadView | null>>({
    lesson: lessonId ? initialThread : null,
    course: lessonId ? null : initialThread,
  });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const thread = threads[scope];
  const turns = thread?.turns ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, pending?.text]);

  const ask = async (question: string, mode: AssistantMode) => {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setPending({ question: q, mode, text: "" });
    const askedScope = scope;
    let threadId = thread?.id;
    const userTurn: TurnView = { id: `local-${Date.now()}`, role: "user", content: q, citations: [], refused: false };
    try {
      const turn = await streamAnswer(
        "/api/assistant",
        { courseId, lessonId: askedScope === "lesson" ? lessonId : undefined, threadId, question: q, mode },
        {
          onThread: (id) => {
            threadId = id;
            setDraft("");
          },
          onDelta: (text) => setPending((p) => (p ? { ...p, text: p.text + text } : p)),
          onReset: () => setPending((p) => (p ? { ...p, text: "" } : p)),
        },
      );
      const id = threadId!;
      setThreads((all) => {
        const same = all[askedScope]?.id === id ? all[askedScope]!.turns : [];
        return { ...all, [askedScope]: { id, turns: [...same, userTurn, turn] } };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      // The question was saved on the server; keep it in view.
      if (threadId) {
        const id = threadId;
        setThreads((all) => {
          const same = all[askedScope]?.id === id ? all[askedScope]!.turns : [];
          return { ...all, [askedScope]: { id, turns: [...same, userTurn] } };
        });
      }
    } finally {
      setPending(null);
    }
  };

  const scopeName = scope === "lesson" && lessonTitle ? `“${lessonTitle}”` : courseTitle;
  const empty = turns.length === 0 && !pending;

  return (
    <section aria-label="Course assistant" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {lessonId ? (
          <ChipGroup
            label="What to ask about"
            value={scope}
            onValueChange={(v) => {
              setScope(v as Scope);
              setError(null);
            }}
            options={[
              { value: "lesson", label: "This lesson" },
              { value: "course", label: "Whole course" },
            ]}
          />
        ) : (
          <span className="font-mono text-label text-ink-soft uppercase">Asking about the whole course</span>
        )}
        {turns.length > 0 && (
          <Button
            variant="link"
            size="xs"
            disabled={Boolean(pending)}
            onClick={() => {
              setThreads((all) => ({ ...all, [scope]: null }));
              setError(null);
            }}
          >
            <Icon icon={RotateCcw} size={14} />
            New chat
          </Button>
        )}
      </div>

      <div ref={listRef} aria-live="polite" className="flex max-h-[560px] min-h-0 flex-col gap-5 overflow-y-auto pr-1">
        {empty && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper px-5 py-4">
            <p className="m-0 flex items-center gap-2 text-[15px] font-medium">
              <Icon icon={Sparkles} size={16} className="text-terracotta" />
              Ask about anything taught in {scopeName}.
            </p>
            <p className="m-0 text-small text-ink-soft">
              Answers come only from the course material, with chips that jump to the moment it was taught.
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <Button key={s} variant="quiet" size="xs" onClick={() => ask(`Explain ${s}`, "answer")}>
                    Explain {s}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t, i) => (
          <Turn
            key={t.id}
            turn={t}
            courseId={courseId}
            courseTitle={courseTitle}
            currentLessonId={lessonId}
            // A refusal offers "Ask your instructor" with the question it refused.
            ask={
              t.refused
                ? {
                    course: { id: courseId, code: courseCode, title: courseTitle },
                    lesson: lessonId && lessonTitle ? { id: lessonId, title: lessonTitle } : undefined,
                    question: turns[i - 1]?.role === "user" ? turns[i - 1].content : "",
                  }
                : undefined
            }
          />
        ))}

        {pending && (
          <>
            <UserBubble text={pending.question} />
            {pending.text ? (
              <AnswerBody content={pending.text} citations={[]} courseId={courseId} streaming />
            ) : (
              <p className="m-0 flex items-center gap-2 text-small text-ink-soft">
                <Icon icon={Loader2} size={15} className="animate-spin" />
                {pending.mode === "where" ? "Finding where it was taught…" : "Looking through the course…"}
              </p>
            )}
          </>
        )}
      </div>

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft, "answer");
        }}
      >
        <label htmlFor={`assistant-q-${scope}`} className="sr-only">
          Your question
        </label>
        <Textarea
          id={`assistant-q-${scope}`}
          rows={2}
          value={draft}
          maxLength={1000}
          placeholder="Ask about a topic, e.g. “What is a linear combination?”"
          invalid={Boolean(error)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft, "answer");
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-meta text-ink-soft">
            {error ? (
              <span role="alert" className="text-terracotta">
                {error}
              </span>
            ) : (
              "Enter to ask · Shift + Enter for a new line"
            )}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={!draft.trim() || Boolean(pending)}
              onClick={() => void ask(draft, "where")}
            >
              <Icon icon={MapPin} size={15} />
              Where was this taught?
            </Button>
            <Button
              type="submit"
              variant={primary ? "primary" : "secondary"}
              size="sm"
              loading={pending?.mode === "answer"}
              disabled={!draft.trim() || Boolean(pending)}
            >
              Ask
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <p className="m-0 max-w-[85%] self-end rounded-2xl bg-oat px-4 py-2.5 text-[15px] leading-[1.55] break-words whitespace-pre-wrap">
      {text}
    </p>
  );
}

function Turn({
  turn,
  courseId,
  courseTitle,
  currentLessonId,
  ask,
}: {
  turn: TurnView;
  courseId: string;
  courseTitle: string;
  currentLessonId?: string;
  ask?: ComponentProps<typeof Refusal>["ask"];
}) {
  if (turn.role === "user") return <UserBubble text={turn.content} />;
  if (turn.refused && ask) return <Refusal courseTitle={courseTitle} ask={ask} />;
  if (turn.content === "") {
    return <Moments citations={turn.citations} courseId={courseId} currentLessonId={currentLessonId} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <AnswerBody content={turn.content} citations={turn.citations} courseId={courseId} currentLessonId={currentLessonId} />
      {turn.citations.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Sources">
          {turn.citations.map((c) => (
            <CitationChip key={c.chunkId} citation={c} courseId={courseId} currentLessonId={currentLessonId} />
          ))}
        </div>
      )}
    </div>
  );
}

/* "Where was this taught?": one card per moment, the whole card jumps. */
function Moments({ citations, courseId, currentLessonId }: { citations: ChatCitation[]; courseId: string; currentLessonId?: string }) {
  const seekFor = useCitationSeek(currentLessonId);
  return (
    <ul aria-label="Where it was taught" className="m-0 flex list-none flex-col gap-2 p-0">
      {citations.map((c) => {
        const seek = seekFor(c);
        const href = citationHref(courseId, c);
        const body = (
          <>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-clay px-2.5 font-mono text-[12px] text-clay-ink">
              {c.label}
            </span>
            {c.snippet && <span className="text-small leading-[1.5] text-ink">“{c.snippet}”</span>}
          </>
        );
        const cls = cn(
          "flex w-full flex-col items-start gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-left no-underline hover:bg-oat",
        );
        return (
          <li key={c.chunkId}>
            {seek ? (
              <button type="button" onClick={seek} className={cn(cls, "cursor-pointer")}>
                {body}
              </button>
            ) : href && isDocumentCitation(c) ? (
              <a href={href} target="_blank" rel="noopener" className={cls}>
                {body}
              </a>
            ) : href ? (
              <Link href={href} className={cls}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
