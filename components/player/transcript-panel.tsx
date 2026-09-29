"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/time";
import { activeIndex } from "@/lib/video/watch";
import { usePlayer } from "./player-context";

/* Transcript that follows playback (feature 11). The line playing now is
   highlighted from the player's throttled time; clicking a line seeks
   there. It scrolls itself to keep the current line in view until the
   student scrolls by hand, then offers a "Follow along" button.

   Long lectures (feature 23) render only the lines in view: a 2-hour
   lecture has ~2,000 lines. Shorter ones keep every line in the page, so
   find-in-page and screen readers see the whole transcript. */

export interface TranscriptLine {
  startSec: number;
  text: string;
}

/* ~40 minutes of Whisper segments. */
export const VIRTUALIZE_FROM = 400;

const listClass = "relative m-0 max-h-[440px] list-none overflow-y-auto rounded-card border border-line bg-paper p-2";

export function TranscriptPanel({ segments }: { segments: TranscriptLine[] }) {
  const { time, seek } = usePlayer();
  const [following, setFollowing] = useState(true);
  const starts = useMemo(() => segments.map((s) => s.startSec), [segments]);
  const active = activeIndex(starts, time);

  if (segments.length === 0) {
    return (
      <EmptyState
        title="No transcript yet"
        description="The transcript appears here once the lecture has been transcribed."
      />
    );
  }

  const props = {
    segments,
    active,
    following,
    stopFollowing: () => setFollowing(false),
    onPick: (sec: number) => {
      seek(sec);
      setFollowing(true);
    },
  };

  return (
    <div className="relative">
      {segments.length >= VIRTUALIZE_FROM ? <VirtualList {...props} /> : <FullList {...props} />}
      {!following && (
        <Button
          variant="quiet"
          size="xs"
          onClick={() => setFollowing(true)}
          leading={<Icon icon={ArrowDown} size={14} />}
          className="absolute right-4 bottom-4 shadow-raised"
        >
          Follow along
        </Button>
      )}
    </div>
  );
}

interface ListProps {
  segments: TranscriptLine[];
  active: number;
  following: boolean;
  stopFollowing: () => void;
  onPick: (sec: number) => void;
}

/* Scrolling by hand (wheel, touch, page keys) stops the auto-follow. */
function manualScrollHandlers(stop: () => void) {
  return {
    onWheel: stop,
    onTouchMove: stop,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (["PageUp", "PageDown", "Home", "End"].includes(e.key)) stop();
    },
  };
}

function FullList({ segments, active, following, stopFollowing, onPick }: ListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!following || !list || active < 0) return;
    const row = list.children[active] as HTMLElement | undefined;
    if (!row) return;
    // Scroll the panel only — never the page.
    list.scrollTo({ top: Math.max(0, row.offsetTop - list.clientHeight / 3), behavior: "smooth" });
  }, [active, following]);

  return (
    <ol ref={listRef} aria-label="Transcript" {...manualScrollHandlers(stopFollowing)} className={cn(listClass, "flex flex-col gap-0.5")}>
      {segments.map((s, i) => (
        <li key={`${i}-${s.startSec}`}>
          <Line line={s} current={i === active} onPick={onPick} />
        </li>
      ))}
    </ol>
  );
}

function VirtualList({ segments, active, following, stopFollowing, onPick }: ListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // useVirtualizer returns fresh functions each render, so the React
  // Compiler skips memoizing this component. That's what we want here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
    // Before the browser measures (server render), show the first lines.
    initialRect: { width: 600, height: 440 },
  });

  useEffect(() => {
    if (following && active >= 0) virtualizer.scrollToIndex(active, { align: "center" });
  }, [active, following, virtualizer]);

  return (
    <div ref={scrollRef} {...manualScrollHandlers(stopFollowing)} className={listClass}>
      <ol aria-label="Transcript" className="relative m-0 list-none p-0" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const s = segments[v.index];
          return (
            <li
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              aria-setsize={segments.length}
              aria-posinset={v.index + 1}
              className="absolute top-0 left-0 w-full pb-0.5"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <Line line={s} current={v.index === active} onPick={onPick} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Line({ line, current, onPick }: { line: TranscriptLine; current: boolean; onPick: (sec: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(line.startSec)}
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex w-full cursor-pointer gap-4 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-[15px] leading-[1.55] text-ink hover:bg-oat",
        current && "bg-butter-tint hover:bg-butter-tint",
      )}
    >
      <span className={cn("w-12 shrink-0 pt-0.5 font-mono text-meta text-ink-soft", current && "text-butter-ink")}>
        {formatTime(line.startSec)}
      </span>
      <span>{line.text}</span>
    </button>
  );
}
