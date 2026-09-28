"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/time";
import { activeIndex } from "@/lib/video/watch";
import { usePlayer } from "./player-context";
import type { PlayerChapter } from "./video-player";

/* Chapters with their start times (feature 11; the chapters themselves
   come from feature 12). Clicking one seeks; the chapter playing now is
   marked. The same chapters are drawn as markers on the scrubber. */
export function ChapterList({ chapters }: { chapters: PlayerChapter[] }) {
  const { time, seek } = usePlayer();
  const starts = useMemo(() => chapters.map((c) => c.startSec), [chapters]);
  const active = activeIndex(starts, time);

  return (
    <ol aria-label="Chapters" className="m-0 flex list-none flex-col gap-1 p-0">
      {chapters.map((c, i) => (
        <li key={`${c.startSec}-${c.title}`}>
          <button
            type="button"
            onClick={() => seek(c.startSec)}
            aria-current={i === active ? "true" : undefined}
            className={cn(
              "flex w-full cursor-pointer items-baseline gap-4 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left text-[15px] text-ink hover:bg-oat",
              i === active && "bg-paper font-medium shadow-hairline",
            )}
          >
            <span className="w-14 shrink-0 font-mono text-meta text-ink-soft">{formatTime(c.startSec)}</span>
            <span>{c.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
