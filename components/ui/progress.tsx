import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/* Sage fill on an Oat track. Heights 5 (mobile), 6 (default), 8 (hero). */
export function ProgressBar({
  value,
  size = 6,
  label,
  className,
  trackClassName,
}: {
  value: number;
  size?: 5 | 6 | 8;
  label?: string;
  className?: string;
  /* e.g. "bg-paper/70" on a Clay-tint card */
  trackClassName?: string;
}) {
  const v = clamp(value);
  const h = { 5: "h-[5px]", 6: "h-1.5", 8: "h-2" }[size];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label ?? "Progress"}
      className={cn("w-full overflow-hidden rounded-full bg-oat", h, trackClassName, className)}
    >
      <div className={cn("rounded-full bg-sage transition-[width]", h)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* 56px ring: Sage-tint track, Sage arc from 12 o'clock, serif value beside. */
export function ProgressRing({
  value,
  caption,
  className,
}: {
  value: number;
  caption?: ReactNode;
  className?: string;
}) {
  const v = clamp(value);
  const r = 23;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${v}%`}>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-sage-tint" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform="rotate(-90 28 28)"
          className="stroke-sage"
        />
      </svg>
      <div className="flex flex-col">
        <span className="font-serif text-[28px] leading-none">{v}%</span>
        {caption && <span className="text-meta text-ink-soft">{caption}</span>}
      </div>
    </div>
  );
}

export type StepState = "done" | "current" | "upcoming";

/* 22px lesson step: done = Sage with check, current = Terracotta ring + dot,
   upcoming = empty ring. */
export function StepIndicator({ state, className }: { state: StepState; className?: string }) {
  const label = { done: "Completed", current: "Current", upcoming: "Not started" }[state];
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
        state === "done" && "bg-sage text-paper",
        state === "current" && "border-2 border-terracotta",
        state === "upcoming" && "border-[1.5px] border-line-strong",
        className,
      )}
    >
      {state === "done" && <Icon icon={Check} size={13} strokeWidth={2.4} />}
      {state === "current" && <span className="size-2 rounded-full bg-terracotta" />}
    </span>
  );
}
