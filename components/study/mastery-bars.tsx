"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useOptionalPlayer } from "@/components/player/player-context";
import { Icon } from "@/components/ui";
import type { TopicMasteryView } from "@/lib/study/quiz";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils/cn";

/* Mastery per topic (feature 16, lib/study/mastery.ts): sage from 80%,
   butter from 50%, clay below. A weak topic links back to where it's
   taught: a seek in the player, otherwise the lesson at that time. */

const FILL = { sage: "bg-sage", butter: "bg-butter", clay: "bg-terracotta/55" } as const;

export function MasteryBars({
  topics,
  courseId,
  lessonId,
}: {
  topics: TopicMasteryView[];
  courseId: string;
  lessonId: string;
}) {
  const player = useOptionalPlayer();
  if (topics.length === 0) return null;
  const tried = topics.some((t) => t.total > 0);
  return (
    <section aria-label="Mastery by topic" className="flex flex-col gap-3">
      <h3 className="m-0 text-h3 font-semibold">Mastery by topic</h3>
      {!tried && <p className="m-0 text-small text-ink-soft">Answer a few questions and your mastery of each topic shows here.</p>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {topics.map((t) => {
          const weak = t.total > 0 && t.tone === "clay";
          return (
            <li key={t.topic} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-small">
                <span className="font-medium">{t.topic}</span>
                <span className="flex items-center gap-2">
                  {weak &&
                    t.startSec !== null &&
                    (player ? (
                      <button
                        type="button"
                        onClick={() => {
                          player.seek(t.startSec!);
                          player.videoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className={chip}
                      >
                        <Icon icon={Play} size={10} fill="currentColor" />
                        Review in video · {formatTime(t.startSec)}
                      </button>
                    ) : (
                      <Link href={`/courses/${courseId}/lessons/${lessonId}?t=${Math.floor(t.startSec)}`} className={chip}>
                        <Icon icon={Play} size={10} fill="currentColor" />
                        Review in video · {formatTime(t.startSec)}
                      </Link>
                    ))}
                  <span className="font-mono text-meta text-ink-soft">
                    {t.total > 0 ? `${t.pct}% · ${t.correct}/${t.total}` : "Not tried yet"}
                  </span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${t.topic} mastery`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={t.pct}
                className="h-1.5 w-full overflow-hidden rounded-full bg-oat"
              >
                <div className={cn("h-1.5 rounded-full", FILL[t.tone])} style={{ width: `${t.total > 0 ? Math.max(t.pct, 3) : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const chip =
  "inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border-0 bg-clay px-2.5 font-mono text-[12px] text-clay-ink no-underline hover:bg-clay-stripe hover:text-clay-ink";
