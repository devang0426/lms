import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/* Status badges (ui-context.md → Chips and status badges). */
const tones = {
  success: "bg-sage-tint text-sage-ink", // Completed, Published, Teaching mode
  warning: "bg-butter-tint text-butter-ink", // Due, Scheduled, "3 days"
  new: "bg-clay text-clay-ink", // New
  neutral: "bg-oat text-ink-soft", // Draft
  onImage: "bg-paper text-clay-ink", // "New" on a course cover
} as const;

const sizes = {
  sm: "h-[22px] px-2 text-[11px]",
  md: "h-[26px] px-2.5 text-[12px]",
  lg: "h-7 px-3 text-meta",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  size = "lg",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; size?: keyof typeof sizes }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap",
        sizes[size],
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* Filter chip (36–38px). Presentational: use `asChild` with a <Link> for
   URL-driven filters, or <ChipGroup> for client state. */
export function Chip({
  active = false,
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-active={active || undefined}
      aria-pressed={asChild ? undefined : active}
      className={cn(
        "inline-flex h-[38px] shrink-0 cursor-pointer items-center rounded-full px-4 text-small whitespace-nowrap no-underline transition-colors",
        active
          ? "bg-ink text-cream hover:text-cream"
          : "border border-line bg-transparent text-ink hover:bg-oat hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
