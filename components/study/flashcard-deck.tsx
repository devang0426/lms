"use client";

import "katex/dist/katex.min.css";

import { Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { rateCard } from "@/app/(student)/(sidebar)/study/actions";
import { useOptionalPlayer } from "@/components/player/player-context";
import { Button, EmptyState, Eyebrow, Icon, ProgressBar, toast } from "@/components/ui";
import { formatInterval, nextIntervals, rateCurrent, RATINGS, type RenderedCard } from "@/lib/study/cards";
import type { Rating } from "@/lib/study/fsrs";
import { formatTime } from "@/lib/time";
import { settle } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

/* Flashcard review (feature 15). Space flips the card; 1–4 rate it Again,
   Hard, Good or Easy, and each button shows when the card would come back
   (fsrs.ts, the same math the server applies). "Again" puts the card at
   the back of this session. Ratings are saved in the background; in a
   staff preview (`record` false) nothing is saved. */

const LABELS: Record<Rating, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

export function FlashcardDeck({
  cards,
  total,
  nextDueAt,
  record = true,
  currentLessonId,
  primary = false,
  showSource = false,
  emptyText = "There are no flashcards here yet. They appear once your instructor publishes them.",
}: {
  /* Rendered on the server: renderCards() (components/study/render-cards.ts). */
  cards: RenderedCard[];
  /* All live cards in scope, for the empty state. */
  total: number;
  nextDueAt: number | null;
  record?: boolean;
  /* The lesson being watched: "Review in video" seeks instead of navigating. */
  currentLessonId?: string;
  /* "Show answer" is the page's Terracotta action (not in the player). */
  primary?: boolean;
  /* Show each card's course and lesson (the cross-course /study queue). */
  showSource?: boolean;
  /* When there are no cards at all (a private note says why its are missing). */
  emptyText?: string;
}) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [, startSaving] = useTransition();
  const player = useOptionalPlayer();

  const initial = useMemo(() => new Set(cards.map((c) => c.id)).size, [cards]);
  const current = queue[0];
  const remaining = new Set(queue.map((c) => c.id)).size;
  const reviewed = Object.values(counts).reduce((a, b) => a + b, 0);
  // Re-evaluated per card; the minute this is off by doesn't matter here.
  // eslint-disable-next-line react-hooks/purity
  const intervals = useMemo(() => (current ? nextIntervals(current, Date.now()) : null), [current]);

  const rate = (rating: Rating) => {
    if (!current || !flipped) return;
    const step = rateCurrent(queue, rating, Date.now());
    setQueue(step.queue);
    setFlipped(false);
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    if (!record) return;
    const cardId = current.id;
    // A failed save says so and the session carries on (feature 30).
    startSaving(async () => {
      const result = await settle(rateCard({ cardId, rating }));
      if (!result.ok) toast.error(result.error.message);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        // A focused button handles Space itself (click).
        if (el?.closest("button, a")) return;
        if (current && !flipped) {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && flipped) {
        e.preventDefault();
        rate(RATINGS[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (cards.length === 0) {
    return (
      <EmptyState
        title="Nothing to review right now"
        description={
          total === 0
            ? emptyText
            : nextDueAt
              ? `You're caught up on all ${total} cards. The next one is due ${dueLabel(nextDueAt)}.`
              : `You're caught up on all ${total} cards.`
        }
      />
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <Eyebrow>Session done</Eyebrow>
        <p className="m-0 font-serif text-[34px] leading-[1.1]">
          {initial} {initial === 1 ? "card" : "cards"} reviewed
        </p>
        <ul aria-label="Your ratings" className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
          {RATINGS.map((r) => (
            <li key={r} className="rounded-full bg-oat px-3 py-1 text-meta text-ink-soft">
              {LABELS[r]} <span className="font-mono text-ink">{counts[r]}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 max-w-[420px] text-small text-ink-soft">
          {record
            ? `${reviewed} ${reviewed === 1 ? "rating" : "ratings"} saved. Each card comes back when it's due, sooner if you found it hard.`
            : "Preview only: nothing was saved."}
        </p>
      </div>
    );
  }

  // A private note's card (feature 19) has no lesson, so no video to review in.
  const videoTime = current.lessonId ? current.startSec : null;
  const inThisLesson = player && currentLessonId === current.lessonId;

  return (
    <section aria-label="Flashcards" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-meta text-ink-soft">
        <span>
          <span className="font-mono text-ink">{Math.min(initial, initial - remaining + 1)}</span> of{" "}
          <span className="font-mono">{initial}</span>
          {counts.again > 0 && <> · {counts.again} to repeat</>}
        </span>
        {!record && <span className="font-mono text-label uppercase">Preview · not saved</span>}
      </div>
      <ProgressBar value={((initial - remaining) / initial) * 100} label="Session progress" />

      <div
        className={cn(
          "flex min-h-[260px] flex-col gap-5 rounded-3xl border border-line bg-paper px-6 py-7 md:px-10",
          !flipped && "cursor-pointer hover:bg-oat/40",
        )}
        onClick={() => !flipped && setFlipped(true)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>
            {[showSource ? `${current.courseCode} · ${current.lessonTitle}` : null, current.topic || null, current.state === "new" ? "New" : null]
              .filter(Boolean)
              .join(" · ") || "Flashcard"}
          </Eyebrow>
          {videoTime !== null &&
            (inThisLesson ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  player.seek(videoTime);
                  player.videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-clay px-3 font-mono text-[12px] text-clay-ink hover:bg-clay-stripe"
              >
                <Icon icon={Play} size={10} fill="currentColor" />
                Review in video · {formatTime(videoTime)}
              </button>
            ) : (
              <Link
                href={`/courses/${current.courseId}/lessons/${current.lessonId}?t=${Math.floor(videoTime)}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-clay px-3 font-mono text-[12px] text-clay-ink no-underline hover:bg-clay-stripe hover:text-clay-ink"
              >
                <Icon icon={Play} size={10} fill="currentColor" />
                Review in video · {formatTime(videoTime)}
              </Link>
            ))}
        </div>
        <p
          className="m-0 text-center font-serif text-[26px] leading-[1.25] md:text-[30px]"
          dangerouslySetInnerHTML={{ __html: current.frontHtml }}
        />
        <div aria-live="polite" className="flex flex-col gap-5">
          {flipped && (
            <>
              <hr className="m-0 border-0 border-t border-line" />
              <p
                className="m-0 text-center text-[17px] leading-[1.6]"
                dangerouslySetInnerHTML={{ __html: current.backHtml }}
              />
            </>
          )}
        </div>
      </div>

      {flipped && intervals ? (
        <div role="group" aria-label="How well did you know it?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r, i) => (
            <Button
              key={r}
              variant={r === "good" ? "secondary" : "quiet"}
              size="lg"
              onClick={() => rate(r)}
              className="h-auto flex-col gap-0.5 py-2.5"
              aria-label={`${LABELS[r]}: back in ${formatInterval(intervals[r])} (key ${i + 1})`}
            >
              <span>{LABELS[r]}</span>
              <span className="font-mono text-[12px] font-normal text-ink-soft">{formatInterval(intervals[r])}</span>
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-meta text-ink-soft">Space to flip · 1–4 to rate</span>
          <Button variant={primary ? "primary" : "secondary"} size="lg" onClick={() => setFlipped(true)}>
            <Icon icon={RotateCcw} size={16} />
            Show answer
          </Button>
        </div>
      )}
    </section>
  );
}

function dueLabel(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? `today at ${time}` : `on ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;
}
