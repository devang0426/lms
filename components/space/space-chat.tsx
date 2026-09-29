"use client";

import { BookOpen, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnswerBody } from "@/components/assistant/answer-body";
import { UserBubble, type ChatThreadView } from "@/components/assistant/assistant-chat";
import { CitationChip } from "@/components/assistant/citation-chip";
import { SpaceRefusal } from "@/components/assistant/refusal";
import { streamAnswer } from "@/components/assistant/stream";
import { Button, Chip, Icon, Textarea } from "@/components/ui";
import type { TurnView } from "@/lib/chat/types";

/* A private note's Chat tab (feature 19): ask about your own uploads and
   get answers with chips that open your file at the cited page (or
   moment). "Include my courses" also searches the courses you're enrolled
   in, so an answer can cite a lecture too; it applies to each question as
   it's asked. The course assistant's rule holds: nothing relevant found
   means the fixed refusal, never an answer from general knowledge. One
   conversation per note, reopened when the note is. */

interface Pending {
  question: string;
  text: string;
}

export function SpaceChat({
  noteId,
  initialThread,
  suggestions,
}: {
  noteId: string;
  initialThread: ChatThreadView | null;
  /* The note's own headings, offered as first questions. */
  suggestions: string[];
}) {
  const [withCourses, setWithCourses] = useState(false);
  const [thread, setThread] = useState<ChatThreadView | null>(initialThread);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const turns = thread?.turns ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, pending?.text]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    setPending({ question: q, text: "" });
    let threadId = thread?.id;
    const userTurn: TurnView = { id: `local-${Date.now()}`, role: "user", content: q, citations: [], refused: false };
    const append = (id: string, added: TurnView[]) =>
      setThread((t) => ({ id, turns: [...(t?.id === id ? t.turns : []), ...added] }));
    try {
      const turn = await streamAnswer(
        "/api/space/chat",
        { noteId, threadId, question: q, includeCourses: withCourses },
        {
          onThread: (id) => {
            threadId = id;
            setDraft("");
          },
          onDelta: (text) => setPending((p) => (p ? { ...p, text: p.text + text } : p)),
          onReset: () => setPending((p) => (p ? { ...p, text: "" } : p)),
        },
      );
      append(threadId!, [userTurn, turn]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      // The question was saved on the server; keep it in view.
      if (threadId) append(threadId, [userTurn]);
    } finally {
      setPending(null);
    }
  };

  const empty = turns.length === 0 && !pending;

  return (
    <section aria-label="Chat about your notes" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Chip active={withCourses} disabled={Boolean(pending)} onClick={() => setWithCourses((on) => !on)} className="gap-2">
            <Icon icon={BookOpen} size={15} />
            Include my courses
          </Chip>
          <span className="text-meta text-ink-soft">
            {withCourses ? "Searching your uploads and your courses" : "Searching your uploads only"}
          </span>
        </div>
        {turns.length > 0 && (
          <Button
            variant="link"
            size="xs"
            disabled={Boolean(pending)}
            onClick={() => {
              setThread(null);
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
              Ask about anything in your notes.
            </p>
            <p className="m-0 text-small text-ink-soft">
              Answers come only from what you&rsquo;ve uploaded{withCourses ? " and your courses" : ""}, with chips that open the
              page they came from. Only you can see this chat.
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <Button key={s} variant="quiet" size="xs" onClick={() => ask(`Explain ${s}`)}>
                    Explain {s}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t) => (
          <SpaceTurn key={t.id} turn={t} />
        ))}

        {pending && (
          <>
            <UserBubble text={pending.question} />
            {pending.text ? (
              <AnswerBody content={pending.text} citations={[]} streaming />
            ) : (
              <p className="m-0 flex items-center gap-2 text-small text-ink-soft">
                <Icon icon={Loader2} size={15} className="animate-spin" />
                {withCourses ? "Looking through your notes and courses…" : "Looking through your notes…"}
              </p>
            )}
          </>
        )}
      </div>

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor={`space-q-${noteId}`} className="sr-only">
          Your question
        </label>
        <Textarea
          id={`space-q-${noteId}`}
          rows={2}
          value={draft}
          maxLength={1000}
          placeholder="Ask about your notes, e.g. “What's the main argument?”"
          invalid={Boolean(error)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
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
          <Button type="submit" variant="secondary" size="sm" loading={Boolean(pending)} disabled={!draft.trim() || Boolean(pending)}>
            Ask
          </Button>
        </div>
      </form>
    </section>
  );
}

function SpaceTurn({ turn }: { turn: TurnView }) {
  if (turn.role === "user") return <UserBubble text={turn.content} />;
  if (turn.refused) return <SpaceRefusal />;
  return (
    <div className="flex flex-col gap-3">
      <AnswerBody content={turn.content} citations={turn.citations} />
      {turn.citations.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Sources">
          {turn.citations.map((c) => (
            <CitationChip key={c.chunkId} citation={c} />
          ))}
        </div>
      )}
    </div>
  );
}
