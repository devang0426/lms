"use client";

import { Play } from "lucide-react";
import { Icon } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { usePlayer } from "./player-context";

/* "▶ 12:48" beside a note heading: seeks the player to where it was taught. */
export function SeekChip({ sec }: { sec: number }) {
  const { seek } = usePlayer();
  return (
    <button
      type="button"
      onClick={() => seek(sec)}
      aria-label={`Play from ${formatTime(sec)}`}
      className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border-0 bg-clay px-2 align-middle font-mono text-[12px] font-normal text-clay-ink hover:bg-clay-stripe"
    >
      <Icon icon={Play} size={10} fill="currentColor" />
      {formatTime(sec)}
    </button>
  );
}
