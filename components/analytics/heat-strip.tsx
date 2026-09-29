import { dropOffBin } from "@/lib/analytics";
import { formatTime } from "@/lib/time";

/* A lecture's watch heat-strip (feature 22): the video cut into slices,
   each as dark (Sage) as the share of students who watched it. Chapter
   starts are ticks under the strip. A sentence says the same in words for
   screen readers and a quick read. */
export function HeatStrip({
  counts,
  viewers,
  durationSec,
  chapters,
}: {
  counts: number[];
  viewers: number;
  durationSec: number;
  chapters: { title: string; startSec: number }[];
}) {
  const size = durationSec / counts.length;
  const drop = dropOffBin(counts, viewers);
  const summary =
    viewers === 0
      ? "No student has watched this yet."
      : drop === null
        ? `Watched by ${viewers} ${viewers === 1 ? "student" : "students"}; most keep watching to the end.`
        : `Watched by ${viewers} ${viewers === 1 ? "student" : "students"}; fewer than half are still watching at ${formatTime(drop * size)}.`;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="flex h-10 gap-px overflow-hidden rounded-xl bg-oat" aria-hidden>
        {counts.map((n, i) => (
          <span
            key={i}
            className="h-full grow bg-sage"
            style={{ opacity: viewers && n ? 0.18 + 0.82 * (n / viewers) : 0 }}
            title={`${formatTime(i * size)}–${formatTime((i + 1) * size)} · ${n} of ${viewers}`}
          />
        ))}
      </div>
      <div className="relative h-3" aria-hidden>
        {chapters.map((c) => (
          <span
            key={`${c.startSec}-${c.title}`}
            className="absolute top-0 h-2 w-px bg-ink-soft"
            style={{ left: `${Math.min(100, (c.startSec / durationSec) * 100)}%` }}
            title={`${formatTime(c.startSec)} · ${c.title}`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink-soft" aria-hidden>
        <span>{formatTime(0)}</span>
        <span>{formatTime(durationSec / 2)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
      <figcaption className="text-meta text-ink-soft">{summary}</figcaption>
    </figure>
  );
}
