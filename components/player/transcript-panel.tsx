"use client";

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
   student scrolls by hand, then offers a "Follow along" button. */

export interface TranscriptLine {
  startSec: number;
  text: string;
}

export function TranscriptPanel({ segments }: { segments: TranscriptLine[] }) {
  const { time, seek } = usePlayer();
  const listRef = useRef<HTMLOListElement>(null);
  const [following, setFollowing] = useState(true);
  const starts = useMemo(() => segments.map((s) => s.startSec), [segments]);
  const active = activeIndex(starts, time);

  useEffect(() => {
    const list = listRef.current;
    if (!following || !list || active < 0) return;
    const row = list.children[active] as HTMLElement | undefined;
    if (!row) return;
    // Scroll the panel only — never the page.
    list.scrollTo({ top: Math.max(0, row.offsetTop - list.clientHeight / 3), behavior: "smooth" });
  }, [active, following]);

  if (segments.length === 0) {
    return (
      <EmptyState
        title="No transcript yet"
        description="The transcript appears here once the lecture has been transcribed."
      />
    );
  }

  const stopFollowing = () => setFollowing(false);

  return (
    <div className="relative">
      <ol
        ref={listRef}
        aria-label="Transcript"
        onWheel={stopFollowing}
        onTouchMove={stopFollowing}
        onKeyDown={(e) => {
          if (["PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollowing();
        }}
        className="relative m-0 flex max-h-[440px] list-none flex-col gap-0.5 overflow-y-auto rounded-card border border-line bg-paper p-2"
      >
        {segments.map((s, i) => (
          <li key={`${i}-${s.startSec}`}>
            <button
              type="button"
              onClick={() => {
                seek(s.startSec);
                setFollowing(true);
              }}
              aria-current={i === active ? "true" : undefined}
              className={cn(
                "flex w-full cursor-pointer gap-4 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-[15px] leading-[1.55] text-ink hover:bg-oat",
                i === active && "bg-butter-tint hover:bg-butter-tint",
              )}
            >
              <span className={cn("w-12 shrink-0 pt-0.5 font-mono text-meta text-ink-soft", i === active && "text-butter-ink")}>
                {formatTime(s.startSec)}
              </span>
              <span>{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
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
